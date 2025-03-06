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
    toggleLinkType, 
    removeSelectedNodesFromGraph, 
    addRecommendationsFromSelectedPapers,
    startSimulationRendering,
    clearNodeSelection,
    unpinNodes,
    addCitationsFromSelectedPaper,
    addReferencesFromSelectedPaper,
    addPapersFromAuthor,
    restoreDeletedPapers,
} from "./src/graph.js";
import { getAuthorsPapers, getCitationsForPaper, getReferencesForPaper } from "./src/api.js";
import { io } from "socket.io-client";

// Fetch initial paper data and initialize the graph
async function initializeApp() {
    await fetchInitialPapers();  // Fetch initial paper data
    initializeSimulation();      // Initialize force simulation
    createNodes();               // Create the initial set of nodes
    startSimulationRendering();  // Start rendering the simulation
}


// Attach UI button behaviors
recommendButton.onPointerClickObservable.add(() => addRecommendationsFromSelectedPapers());
deleteButton.onPointerClickObservable.add(() => removeSelectedNodesFromGraph());
clearSelectionButton.onPointerClickObservable.add(() => clearNodeSelection());
unpinNodesButton.onPointerClickObservable.add(() => unpinNodes());
toggleLinksButton.onPointerClickObservable.add(() => toggleLinkType());

// Add Keybinds for Graph Interaction
window.addEventListener("keydown", (ev) => {
    // Add debug layer
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
        console.log("L pressed - Toggling links");
        toggleLinkType();
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
});

// Start application initialization
initializeApp();

// --- Socket.IO Connection and Event Listener ---
// Connect to a Socket.IO server running on port 3000
// --- Socket.IO Connection and Event Listener ---
// Connect to a Socket.IO server running on port 3000
const socket = io("https://128.61.40.18:3000");

// Log when the connection is established
socket.on("connect", () => {
    console.log(`Socket connected: ${socket.id}`);
});

// Log any connection errors
socket.on("connect_error", (error) => {
    console.error("Connection Error:", error);
});

socket.on("recommendByThematicSimilarity", (data) => {
    console.log("Received socket.io event:", data);
    addRecommendationsFromSelectedPapers();
});


socket.on("toggleLinks", (data) => {
    console.log("Received socket.io event:", data);
    toggleLinkType();
});