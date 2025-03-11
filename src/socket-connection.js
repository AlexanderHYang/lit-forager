import { io } from "socket.io-client";
import {
    addRecommendationsFromSelectedPapers,
    changeLinkType,
    addSummaryForPaper,
    removeSelectedNodesFromGraph,
    clearNodeSelection,
    unpinNodes,
    addCitationsFromSelectedPaper,
    addReferencesFromSelectedPaper,
    restoreDeletedPapers,
    createClustersFromGemini
} from "./graph.js";

// Declare a socket variable to be used globally
let socket;

export function initializeSocketConnection() {
    // Use the current hostname and connect on port 3000 over HTTPS
    const host = window.location.hostname;
    socket = io(`https://${host}:3000`, {
        // Set to auto-reconnect up to 5 times
        reconnectionAttempts: 1,
        // Delay between reconnection attempts (in ms)
        // reconnectionDelay: 500,
    });

    // Log when the connection is established
    socket.on("connect", () => {
        console.log(`Socket connected: ${socket.id}. Connected to server at: ${host}:3000`);
    });

    // Log any connection errors
    socket.on("connect_error", (error) => {
        console.error("Connection Error:", error);
    });

    // When reconnection attempts have failed, log and disconnect the socket
    socket.io.on("reconnect_failed", () => {
        console.error("All connection attempts failed. Closing socket.");
        socket.disconnect();
    });

    // Set up custom event listeners
    socket.on("recommendByThematicSimilarity", (data) => {
        console.log("Received socket.io event:", data);
        addRecommendationsFromSelectedPapers();
    });

    socket.on("recommendByCitations", (data) => {
        console.log("Received socket.io event:", data);
        addCitationsFromSelectedPaper();
    });

    socket.on("recommendByReferences", (data) => {
        console.log("Received socket.io event:", data);
        addReferencesFromSelectedPaper();
    });

    socket.on("toggleLinks", (data) => {
        console.log("Received socket.io event:", data);
        changeLinkType();
    });

    socket.on("summarizePaperGemini", (data) => {
        console.log("Received socket.io event:", data);
        addSummaryForPaper(data.response, data.paperId);
    });

    socket.on("createClustersGemini", (data) => {
        console.log("Received socket.io event for createClustersGemini:", data);
        createClustersFromGemini(data.clusters);
    })

    socket.on("deletePaper", (data) => {
        console.log("Received socket.io event:", data);
        removeSelectedNodesFromGraph();
    });

    socket.on("clearNodeSelection", (data) => {
        console.log("Received socket.io event:", data);
        clearNodeSelection();
    });

    socket.on("unpinNodes", (data) => {
        console.log("Received socket.io event:", data);
        unpinNodes();
    });

    socket.on("restoreDeletedPapers", (data) => {
        console.log("Received socket.io event:", data);
        restoreDeletedPapers();
    });

    return socket;
}

// Also export the socket so it can be imported elsewhere
export { socket };
