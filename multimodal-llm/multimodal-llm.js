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

// Define __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -------------------- Configuration & Globals --------------------
const encoding = "LINEAR16";
const sampleRateHertz = 16000;
const languageCode = "en-US";
const streamingLimit = 200000; // ms - low value for demo

// Replace with your actual API key
const genAI = new GoogleGenerativeAI("redacted");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const prompt =
  "Summarize the following abstract of a research paper in a tldr format (in a few sentences): immersive analytics turns the very space surrounding the user into a canvas for data analysis, supporting human cognitive abilities in myriad ways. We present the results of a design study, contextual inquiry, and longitudinal evaluation involving professional economists using a Virtual Reality (VR) system for multidimensional visualization to explore actual economic data. Results from our preregistered evaluation highlight the varied use of space depending on context (exploration vs. presentation), the organization of space to support work, and the impact of immersion on navigation and orientation in the 3D analysis space";

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

// Keyword to trigger Gemini API
const keywords = ["recommend"];

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
  const correctedTime =
    resultEndTime - bridgingOffset + streamingLimit * restartCounter;

  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  let stdoutText = "";
  if (stream.results[0] && stream.results[0].alternatives[0]) {
    stdoutText =
      correctedTime + ": " + stream.results[0].alternatives[0].transcript;
  }

  if (stream.results[0].isFinal) {
    process.stdout.write(chalk.green(`${stdoutText}\n`));
    isFinalEndTime = resultEndTime;
    lastTranscriptWasFinal = true;

    // Check for keywords in the final transcript
    keywords.forEach(async (keyword) => {
      if (stream.results[0].alternatives[0].transcript.includes(keyword)) {
        console.log(chalk.blue(`Keyword detected: ${keyword}`));
        try {
          const result = await model.generateContent(prompt);
          const geminiResponse = result.response.text();
          console.log("Gemini Response:", geminiResponse);
          // Emit the Gemini response via WebSocket
          io.emit("geminiUpdate", { geminiResponse });
        } catch (err) {
          console.error("Error generating Gemini response:", err);
        }
      }
    });
  } else {
    if (stdoutText.length > process.stdout.columns) {
      stdoutText =
        stdoutText.substring(0, process.stdout.columns - 4) + "...";
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
        if (bridgingOffset > finalRequestEndTime)
          bridgingOffset = finalRequestEndTime;
        const chunksFromMS = Math.floor(
          (finalRequestEndTime - bridgingOffset) / chunkTime
        );
        bridgingOffset = Math.floor(
          (lastAudioInput.length - chunksFromMS) * chunkTime
        );
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
  process.stdout.write(
    chalk.yellow(`${streamingLimit * restartCounter}: RESTARTING REQUEST\n`)
  );
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
console.log("Listening, press Ctrl+C to stop.");
console.log("");
console.log("End (ms)       Transcript Results/Status");
console.log("=========================================================");
startStream();

// -------------------- Express & Socket.io Setup --------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve a simple HTML file for testing
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

server.listen(3000, () => {
  console.log(`WebSocket server listening on port 3000`);
});

// Graceful shutdown function
function shutdown() {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

// Set up stdin to listen for keypresses
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (data) => {
  const key = data.toString();
  if (key === 'q' || key === 'Q') {
    shutdown();
  }
});