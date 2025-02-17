import { 
    engine, 
    scene, 
    recommendButton, 
    deleteButton, 
    toggleLinksButton,
    clearSelectionButton,
    unpinNodesButton,
} from "./graphics.js";
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
} from "./graph.js";

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
});

// Start application initialization
initializeApp();