import {
    engine,
    scene,
    recommendButton,
    deleteButton,
    toggleLinksButton,
    clearSelectionButton,
    unpinNodesButton,
} from "./src/graphics.js";
import {
    fetchInitialPapers,
    initializeSimulation,
    createNodes,
    changeLinkType as changeLinkType,
    removeSelectedNodesFromGraph,
    addRecommendationsFromSelectedPapers,
    startSimulationRendering,
    clearNodeSelection,
    unpinNodes,
    addCitationsFromSelectedPaper,
    addReferencesFromSelectedPaper,
    addPapersFromAuthor,
    restoreDeletedPapers,
    connectSelectedNodes,
    testCreateClusters,
} from "./src/graph.js";
import { getAuthorsPapers, getCitationsForPaper, getReferencesForPaper } from "./src/api.js";
import { io } from "socket.io-client";
import { initializeSocketConnection, socket } from "./src/socket-connection.js";

// Fetch initial paper data and initialize the graph
async function initializeApp() {
    await fetchInitialPapers(); // Fetch initial paper data
    initializeSimulation(); // Initialize force simulation
    createNodes(); // Create the initial set of nodes
    startSimulationRendering(); // Start rendering the simulation
}

// Add Keybinds for Graph Interaction
window.addEventListener("keydown", (ev) => {
    // Add debug layer: shift + ctrl + alt + i
    if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
        if (scene.debugLayer.isVisible()) {
            scene.debugLayer.hide();
        } else {
            scene.debugLayer.show();
        }
    }

    if (ev.key === "r") {
        console.log("r pressed - Adding recommendations");
        addRecommendationsFromSelectedPapers();
    }
    if (ev.key === "Backspace") {
        console.log("Backspace pressed - Removing selected nodes");
        removeSelectedNodesFromGraph();
    }
    if (ev.key === "l") {
        console.log("L pressed - Changing links");
        changeLinkType();
    }
    if (ev.key === "c") {
        console.log("C pressed - Clearing node selection");
        clearNodeSelection();
    }
    if (ev.key === "u") {
        console.log("U pressed - Unpinning nodes");
        unpinNodes();
    }
    if (ev.key === "1") {
        console.log("1 pressed - Fetching paper citations");
        // console.log(getCitationsForPaper("f9c602cc436a9ea2f9e7db48c77d924e09ce3c32"));
        addCitationsFromSelectedPaper();
    }
    if (ev.key === "2") {
        console.log("2 pressed - Fetching paper references");
        // console.log(getReferencesForPaper("f9c602cc436a9ea2f9e7db48c77d924e09ce3c32"));
        addReferencesFromSelectedPaper();
    }
    if (ev.key === "3") {
        console.log("3 pressed - Fetching author's papers");
        // console.log(getAuthorsPapers("145642373"));
        addPapersFromAuthor("145642373");
    }
    if (ev.key === "4") {
        console.log("4 pressed - Restoring deleted papers");
        restoreDeletedPapers();
    }
    if (ev.key === "5") {
        console.log("5 pressed - Connecting nodes");
        connectSelectedNodes();
    }
    if (ev.key === "6") {
        console.log("6 pressed - Testing clustering");
        // testCreateClusters();
        socket.emit("createClustersButtonPressed", {});
    }
    if (ev.key === "7") {
        console.log("7 pressed - Testing summarize paper");
        // testCreateClusters();
        socket.emit("summarizeButtonPressed", {});
    }
});

window.addEventListener("keydown", async (ev) => {
    if (ev.key === "8") {
        console.log("8 pressed - Sending log data");
        const response = await sendLogData();
        console.log("Log data sent:", response);
    }
});

// Logging
const startTime = Math.round(performance.now());
const logData = [];

export function logEvent(eventType, eventData) {
    const currentTime = Math.round(performance.now());
    const timestamp = currentTime - startTime;
    const stringifiedEventData = JSON.stringify(eventData, (key, value) => {
        if (["abstract", "recommends", "references", "authors", "vx", "vy", "vz", "fx", "fy", "fz", "year", "venue", "citationCount", "referenceCount", "color"].includes(key)) return undefined; // Remove specified keys
        return value; // Allow everything else
    }, 2);
    logData.push({ timestamp, eventType, eventData: stringifiedEventData });
}

async function sendLogData() {
    try {
        const jsonData = JSON.stringify(logData, null, 2);

        // also download locally as backup
        downloadLogFile(jsonData);

        const response = await fetch("https://localhost:3000/upload-log", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: jsonData, // Send logData array
        });

        const result = await response.json();
        console.log("Server response:", result);

    } catch (error) {
        console.error("Error sending log data:", error);
    }
}

// Function to download the log file locally
function downloadLogFile(data) {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-${Date.now()}.json`; // Set the filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Clean up
}

// Start application initialization
initializeApp();

// Start socket connection with the multimodal-llm script
initializeSocketConnection();

window.addEventListener("beforeunload", function (event) {
    // Send log data before the page unloads
    sendLogData();
});