import express from "express";
import http from "http";
import chalk from "chalk";
import { Writable } from "stream";
import recorder from "node-record-lpcm16";
import { v1p1beta1 as speech } from "@google-cloud/speech";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import https from "https";

import * as dotenv from "dotenv";
dotenv.config();

// Define __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -------------------- Configuration & Globals --------------------
const encoding = "LINEAR16";
const sampleRateHertz = 16000;
const languageCode = "en-US";
const streamingLimit = 55000; // ms - low value for demo

// Replace with your actual API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
console.log(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Google Speech client & config
const client = new speech.SpeechClient();
const config = {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
};
const request = {
    config,
    interimResults: true,
};

// Variables for managing the audio stream
let recognizeStream = null;
let restartCounter = 0;
let audioInput = [];
let lastAudioInput = [];
let resultEndTime = 0;
let isFinalEndTime = 0;
let finalRequestEndTime = 0;
let newStream = true;
let bridgingOffset = 0;
let lastTranscriptWasFinal = false;

// -------------------- Speech Streaming Functions --------------------
function startStream() {
    audioInput = [];
    recognizeStream = client
        .streamingRecognize(request)
        .on("error", (err) => {
            if (err.code === 11) {
                // Optionally restart the stream if necessary
            } else {
                console.error("API request error: " + err);
            }
        })
        .on("data", speechCallback);

    setTimeout(restartStream, streamingLimit);
}

const speechCallback = (stream) => {
    resultEndTime =
        stream.results[0].resultEndTime.seconds * 1000 +
        Math.round(stream.results[0].resultEndTime.nanos / 1000000);
    const correctedTime = resultEndTime - bridgingOffset + streamingLimit * restartCounter;

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    let stdoutText = "";
    if (stream.results[0] && stream.results[0].alternatives[0]) {
        stdoutText = correctedTime + ": " + stream.results[0].alternatives[0].transcript;
    }

    if (stream.results[0].isFinal) {
        process.stdout.write(chalk.green(`${stdoutText}\n`));
        isFinalEndTime = resultEndTime;
        lastTranscriptWasFinal = true;

        const transcript = stream.results[0].alternatives[0].transcript;

        // Detect keyword combinations with a required keyword and optional keywords
        const keywordCombinations = [
            {
                required: "recommend",
                optional: ["thematic", "similarity"],
                eventType: "recommendByThematicSimilarity",
            },
            {
                required: "recommend",
                optional: ["author", "authors"],
                eventType: "recommendByAuthor",
            },
            {
                required: "recommend",
                optional: ["citation", "citations"],
                eventType: "recommendByCitations",
            },
            {
                required: "recommend",
                optional: ["reference", "references"],
                eventType: "recommendByReferences",
            },
            {
                required: "change",
                optional: ["links", "link", "link type"],
                eventType: "toggleLinks",
            },
            {
                required: "toggle",
                optional: ["links", "link", "link type"],
                eventType: "toggleLinks",
            },
            {
                required: "summarize",
                optional: ["paper", "papers"],
                eventType: "summarizePaper",
            },
            {
                required: "delete",
                optional: ["paper", "papers", "node", "nodes"],
                eventType: "deletePaper",
            },
            {
                required: "clear",
                optional: ["selection", "selected", "select", "node", "nodes"],
                eventType: "clearNodeSelection",
            },
            {
                required: "unpin",
                optional: ["paper", "papers", "node", "nodes"],
                eventType: "unpinNodes",
            },
            {
                required: "detach",
                optional: ["paper", "papers", "node", "nodes"],
                eventType: "unpinNodes",
            },
            {
                required: "release",
                optional: ["paper", "papers", "node", "nodes"],
                eventType: "unpinNodes",
            },
            {
                required: "restore",
                optional: ["deleted", "delete", "paper", "papers", "node", "nodes"],
                eventType: "restoreDeletedPapers",
            },
            {
                required: "cluster",
                optional: ["papers", "nodes"],
                eventType: "createClusters"
            },
        ];

        keywordCombinations.forEach((combo) => {
            // Check if the transcript contains the required keyword
            // and at least one of the optional keywords
            if (
                transcript.includes(combo.required) &&
                combo.optional.some((opt) => transcript.includes(opt))
            ) {
                console.log(
                    chalk.blue(
                        `Combination detected: Event "${combo.eventType}"\nKeywords: Required "${
                            combo.required
                        }" with optional "${combo.optional.join('" or "')}"`
                    )
                );

                if (combo.eventType === "summarizePaper") {
                    if (
                        selectedPaperData &&
                        selectedPaperData.paperIds &&
                        selectedPaperData.paperIds.length === 1
                    ) {
                        // Use the data received from sendPaperData
                        summarizePaperGemini(selectedPaperData);
                    } else {
                        // Optionally, fallback if no data has been received yet.
                        console.warn("No nodes selected or no selection data available");
                    }
                } else if (combo.eventType == "createClusters") {
                    createClustersGemini()
                } else {
                    // For all other events, emit normally.
                    io.emit(combo.eventType, {
                        info: `Event: "${combo.eventType}"`,
                    });
                }
            }
        });
    } else {
        if (stdoutText.length > process.stdout.columns) {
            stdoutText = stdoutText.substring(0, process.stdout.columns - 4) + "...";
        }
        process.stdout.write(chalk.red(`${stdoutText}`));
        lastTranscriptWasFinal = false;
    }
};

const audioInputStreamTransform = new Writable({
    write(chunk, encoding, next) {
        if (newStream && lastAudioInput.length !== 0) {
            const chunkTime = streamingLimit / lastAudioInput.length;
            if (chunkTime !== 0) {
                if (bridgingOffset < 0) bridgingOffset = 0;
                if (bridgingOffset > finalRequestEndTime) bridgingOffset = finalRequestEndTime;
                const chunksFromMS = Math.floor((finalRequestEndTime - bridgingOffset) / chunkTime);
                bridgingOffset = Math.floor((lastAudioInput.length - chunksFromMS) * chunkTime);
                for (let i = chunksFromMS; i < lastAudioInput.length; i++) {
                    recognizeStream.write(lastAudioInput[i]);
                }
            }
            newStream = false;
        }
        audioInput.push(chunk);
        if (recognizeStream) {
            recognizeStream.write(chunk);
        }
        next();
    },
    final() {
        if (recognizeStream) {
            recognizeStream.end();
        }
    },
});

function restartStream() {
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream.removeListener("data", speechCallback);
        recognizeStream = null;
    }
    if (resultEndTime > 0) {
        finalRequestEndTime = isFinalEndTime;
    }
    resultEndTime = 0;
    lastAudioInput = [];
    lastAudioInput = audioInput;
    restartCounter++;
    if (!lastTranscriptWasFinal) {
        process.stdout.write("\n");
    }
    process.stdout.write(chalk.yellow(`${streamingLimit * restartCounter}: RESTARTING REQUEST\n`));
    newStream = true;
    startStream();
}

// -------------------- Start Recording --------------------
recorder
    .record({
        sampleRateHertz: sampleRateHertz,
        threshold: 0, // Silence threshold
        silence: 1000,
        keepSilence: true,
        recordProgram: "rec", // Try "arecord" or "sox" if needed
    })
    .stream()
    .on("error", (err) => {
        console.error("Audio recording error: " + err);
    })
    .pipe(audioInputStreamTransform);

console.log("");
console.log("Listening, press Ctrl + C to stop.");
console.log("");
console.log("End (ms)       Transcript Results/Status");
console.log("=========================================================");
startStream();

// Your Express app
const app = express();

// Read your SSL/TLS certificate and key files
const options = {
    key: fs.readFileSync(join(__dirname, "certificates", "key.pem")),
    cert: fs.readFileSync(join(__dirname, "certificates", "cert.pem")),
    // Optionally, add ca, passphrase, etc.
};

// Create an HTTPS server using your certificates
const server = https.createServer(options, app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Serve a simple HTML file for testing
app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
});

// Start the HTTPS server
server.listen(3000, "0.0.0.0", () => {
    console.log(`Secure WebSocket server listening on port 3000`);
});

// Global variable to store data from the "sendPaperData" event and "sendAllNodesData".
let selectedPaperData = null;
let allNodesData = null;


// Listen for client connections and handle "sendPaperData" events.
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("sendSelectedNodesData", (data) => {
        console.log("Received data for paper", data.paperIds);
        selectedPaperData = data; // Update global data store.
    });

    // Handle sendAllNodesData event
    socket.on("sendAllNodesData", (data) => {
        console.log("Received all nodes data for paperIds:", data.map((d) => d.paperId));
        allNodesData = data;
    })

    // Handle createClustersButtonPressed event
    socket.on("createClustersButtonPressed", (data) => {
        console.log("Received createClustersButtonPressed event with data", data);
        createClustersGemini();
    })

    // Handle summarizeButtonPressed event
    socket.on("summarizeButtonPressed", (data) => {
        console.log("Received summarizeButtonPressed event with data", data);
        summarizePaperGemini(selectedPaperData);
    })
});

// -------------------- Gemini Functions --------------------

async function summarizePaperGemini(selectedPaperData) {
    try {
        // Final check for exactly one paper id
        if (
            !selectedPaperData ||
            !selectedPaperData.paperIds ||
            selectedPaperData.paperIds.length !== 1
        ) {
            console.warn("Final check failed: Exactly one paper id is required");
            return;
        }
        // Combine your custom prompt with the incoming custom data
        const customPrompt = `Summarize the following paper information in a concise TLDR format:\nTitle: ${selectedPaperData.titles[0]}\nAbstract: ${selectedPaperData.abstracts[0]}`;
        console.log(customPrompt);
        // Use the Gemini model to generate a response (adjust according to your Gemini API usage)
        const result = await model.generateContent(customPrompt);
        const responseText = result.response.text();
        console.log("Gemini response:", responseText);
        // Emit an event back to clients with the Gemini response and the single paper id
        io.emit("summarizePaperGemini", {
            response: responseText,
            paperId: selectedPaperData.paperIds[0],
        });
    } catch (error) {
        console.error("Error sending custom prompt to Gemini:", error);
    }
}

async function createClustersGemini() {
    try {
        // Final check for null or 0 paper ids
        if (!allNodesData) {
            console.warn("Final check failed: ");
            return;
        }

        // Combine your custom prompt with the incoming custom data
        const basePrompt = `You are an AI that clusters academic papers based on thematic similarity. Given a list of papers, each with a unique "paperId", "title", and "abstract", your task is to organize them into **at least 2 clusters** with **at least 2 papers per cluster**.

### Instructions:
- Group papers based on their thematic similarity by analyzing the **title** and **abstract**.
- Each cluster should have a **descriptive name** that summarizes the common theme of the grouped papers.
- Ensure that **each paper appears in only one cluster**.
- **Do not leave any papers unclustered.**
- Return the result in a **valid JSON format** that is easy to parse in JavaScript.

### Input Format Example:
{
    "papers": [
        {"paperId": "p1", "title": "Deep Learning in Healthcare", "abstract": "This paper explores deep learning models applied to medical diagnostics."},
        {"paperId": "p2", "title": "AI in Radiology", "abstract": "We discuss how AI models analyze radiology scans."},
        {"paperId": "p3", "title": "Quantum Computing Advances", "abstract": "Recent progress in quantum computing and its impact on cryptography."},
        {"paperId": "p4", "title": "Secure Quantum Cryptography", "abstract": "New quantum cryptographic protocols to enhance cybersecurity."}
    ]
}

### Expected Output Format:
{
    "clusters": [
        {
            "name": "AI in Healthcare",
            "paperIds": ["p1", "p2"]
        },
        {
            "name": "Quantum Computing & Security",
            "paperIds": ["p3", "p4"]
        }
    ]
}

### Additional Guidelines:
- **Be concise and accurate** when naming the clusters.
- **Do not add extra commentary**—just return the JSON object. Do NOT include any backticks (\`\`\`) before or after the response, and do NOT include a JSON label. The first and last characters should be { and } respectively.
- The response **must be in valid JSON format** with proper syntax.

Now, **process the following input and generate clusters accordingly:**`

        const prompt = `${basePrompt}\n\n${JSON.stringify(allNodesData, null, 4)}`;
        console.log(prompt);

        // Use the Gemini model to generate a response (adjust according to your Gemini API usage)
        const result = await model.generateContent(prompt);
        
        // Extract JSON from response
        const responseText = await result.response.text(); // Await response text
        const cleanedResponse = responseText
            .replace(/```json/g, "") // Remove opening json block
            .replace(/```/g, "") // Remove closing block
            .trim(); // Trim any extra whitespace
        const parsedResponse = JSON.parse(cleanedResponse); // Parse JSON

        // Emit structured response to the frontend
        io.emit("createClustersGemini", {
            status: "success",
            clusters: parsedResponse.clusters, // Only send the relevant part
        });

    } catch (error) {
        console.error("Error sending custom prompt to Gemini:", error);
    }
}
