import { io } from "socket.io-client";
import { addRecommendationsFromSelectedPapers, toggleLinkType,addSummaryForPaper } from "./graph.js";

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

    socket.on("toggleLinks", (data) => {
        console.log("Received socket.io event:", data);
        toggleLinkType();
    });
    
    socket.on("summarizePaperGemini", (data) => {
        console.log("Received socket.io event:", data);
        addSummaryForPaper(data.response,data.paperId);
    });

    return socket;

}

// Also export the socket so it can be imported elsewhere
export { socket };