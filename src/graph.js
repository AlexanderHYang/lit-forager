import { Vector3, Color3, Color4, StandardMaterial } from "@babylonjs/core";
import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCollide,
    forceCenter,
} from "../d3-force-3d/src/index.js";
import * as d3 from "d3";
import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as APIUtils from "./api.js";
import { removeItem } from "./utils.js";
import {
    scene,
    CoT,
    CoT_babylon,
    highlighter,
    hoverPlane,
    setHoverPlaneToNode,
    updatePaperPanelToNode,
    setFullScreenUIText,
    updateInsightsAndNotesText,
    paperDetailsPanelId,
} from "./graphics.js"; // Import shared scene from graphics.js

import { socket } from "./socket-connection.js";
import { logEvent } from "../main.js";

// Shared graph data
export const paperData = [];
export const paperIds = [];
export const citationLinkData = [];
export const recommendationLinkData = [];
export const authorLinkData = [];
export const userLinkData = [];
export const userConnections = [];
export let useCitationLinks = false;
export let linkType = "recommendation";
export const selectedIds = [];
export const removedPaperIds = [];
const pinnedNodeIds = [];
export let nodes = null;
export let links = null;
const pickStartTime = {};
const unpickTime = {};
const shouldDrag = {};
const isDragging = {};
const isPointerOver = {};
const excludeFromNodeConnection = [];
const CLICK_DELAY_THRESHOLD = 400; // milliseconds
export let waitingForAPI = false;
const linkColorMap = {
    citation: Color3.Magenta(),
    recommendation: Color3.White(),
    author: Color3.Yellow(),
    custom: Color3.Green(),
};

// Global variable to store mapping of paperId to summary
export let paperSummaryMap = {};

// Global variable to store mapping of paperId to summary
export let paperKeywordsMap = {};

// Global variable to store mapping of paperId to annotations
export let paperAnnotationsMap = {};

// Initialize force simulation

// Paper with 2000+ authors: "8b16f29a47a86fbd2b3daaf5bcb6356528ba32c0"
export let simulation;

const seedPaperIDs = [
    "0ffd57884d7957f6b5634b9fa24843dc3759668f",
    "944da0eb2aba11aaed51bba35d6e25bda33b2571",
    "644482c6c6ca800ccc4ef07505e34dbde8cefcb4",
];

/**
 * Fetches the initial set of papers.
 */
export async function fetchInitialPapers() {
    waitingForAPI = true;
    try {
        let data = await APIUtils.getDetailsForMultiplePapers(seedPaperIDs);
        if (!Array.isArray(data)) {
            // Fallback: create a paper object for each seed ID if API returns a single object.
            data = seedPaperIDs.map(id => ({
                paperId: id,
                references: [],
                recommends: [],
            }));
        }
        paperData.push(...data);
    } catch (error) {
        console.error("Failed to fetch initial papers", error);
        // Fallback: create a paper object for each seed ID on error.
        seedPaperIDs.forEach(id => {
            paperData.push({
                paperId: id,
                references: [],
                recommends: [],
            });
        });
    }
    // Store all seed paper IDs.
    paperIds.push(...seedPaperIDs);
    
    // Position papers: if one seed, center it, otherwise distribute using Fibonacci lattice.
    if (seedPaperIDs.length === 1) {
        paperData[0].x = 0;
        paperData[0].y = 0;
        paperData[0].z = 0;
    } else {
        const positions = generateFibonacciLatticePositions(seedPaperIDs.length, new Vector3(0, 0, 0), 0.1);
        for (let i = 0; i < paperData.length; i++) {
            paperData[i].x = positions[i].x;
            paperData[i].y = positions[i].y;
            paperData[i].z = positions[i].z;
        }
    }
    waitingForAPI = false;
}

/**
 * Initializes the force simulation.
 */
export function initializeSimulation() {
    simulation = forceSimulation(paperData, 3)
        .force("link", forceLink(citationLinkData).distance(0.15).strength(2))
        .force("charge", forceManyBody().strength(-0.01).distanceMax(0.2))
        .force("collide", forceCollide().radius(0.02).strength(2))
        .on("tick", ticked)
        .on("end", () => simulation.stop());
    console.log("Simulation initialized");
    // console.log(simulation.nodes());
}

// let frames = 0
export function startSimulationRendering() {
    // force simulation to step every frame
    scene.onBeforeRenderObservable.add(() => {
        // simulation.step();
        simulation.tick();
        ticked();

        // frames += 1;
        // if (frames % 60 === 0) {
        //     console.log(selectedIds);
        // }
    });
}

/**
 * Creates link data from paperData.
 */
export function generateLinkData() {
    // logEvent("generateLinkData() called", {previousLinkData: {citationLinkData, recommendationLinkData, authorLinkData, userLinkData}});
    // even though links are initially created as index-based
    // they are later transformed into object-based via updateLines(),
    // anu.js or d3 must do this internally
    citationLinkData.length = 0;
    recommendationLinkData.length = 0;
    authorLinkData.length = 0;
    paperData.forEach((d1, i) => {
        paperData.forEach((d2, j) => {
            if (d1.paperId !== d2.paperId) {
                d1.references.forEach((ref) => {
                    if (ref.paperId === d2.paperId) {
                        citationLinkData.push({ source: d1, target: d2 });
                    }
                });
                d1.recommends.forEach((rec) => {
                    if (rec === d2.paperId) {
                        recommendationLinkData.push({ source: d1, target: d2 });
                    }
                });
            }
            if (i < j) {
                d1.authors.forEach((author1) => {
                    d2.authors.forEach((author2) => {
                        if (author1.authorId === author2.authorId) {
                            authorLinkData.push({ source: d1, target: d2 });
                        }
                    });
                });
                if (
                    userConnections.some(
                        ([a, b]) =>
                            (a === d1.paperId && b === d2.paperId) ||
                            (a === d2.paperId && b === d1.paperId)
                    )
                ) {
                    userLinkData.push({ source: d1, target: d2 });
                }
            }
        });
    });

    const eventData = {};
    eventData.citationLinkData = citationLinkData.map((link) => ({
        source: { paperId: link.source.paperId, title: link.source.title },
        target: { paperId: link.target.paperId, title: link.target.title },
    }));
    eventData.recommendationLinkData = recommendationLinkData.map((link) => ({
        source: { paperId: link.source.paperId, title: link.source.title },
        target: { paperId: link.target.paperId, title: link.target.title },
    }));
    eventData.authorLinkData = authorLinkData.map((link) => ({
        source: { paperId: link.source.paperId, title: link.source.title },
        target: { paperId: link.target.paperId, title: link.target.title },
    }));
    eventData.userLinkData = userLinkData.map((link) => ({
        source: { paperId: link.source.paperId, title: link.source.title },
        target: { paperId: link.target.paperId, title: link.target.title },
    }));
    logEvent("generateLinkData() finished", {newLinkData: eventData});
}

const scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor4());

/**
 * Creates and updates nodes in the Babylon.js scene.
 */
export function createNodes() {
    logEvent("createNodes() called", {paperData: paperData});
    if (!scene) return;

    if (nodes) {
        nodes.run((d, n) => n.dispose());
        nodes = null;
    }

    // ensure data has all the necessary fields
    paperData.forEach((d) => {
        if (!d.recommends) {
            d.recommends = [];
        }
    });

    nodes = CoT.bind("sphere", { segments: 12 }, paperData)
        .position((d) => new Vector3(d.x, d.y, d.z))
        .scaling(() => new Vector3(0.02, 0.02, 0.02))
        .material((d) => {
            let mat = new StandardMaterial("mat");
            mat.specularColor = scaleC(d.color);
            mat.diffuseColor = scaleC(d.color);
            return mat;
        })
        //Add an action that will increase the size of the sphere when the pointer is moved over it
        .action(
            (d, n, i) =>
                new BABYLON.InterpolateValueAction( //Type of action, InterpolateValueAction will interpolave a given property's value over a specified period of time
                    BABYLON.ActionManager.OnPointerOverTrigger, //Action Trigger
                    n, //The Mesh or Node to Change, n in Anu refers to the mesh itself
                    "scaling", //The property to Change
                    new Vector3(0.03, 0.03, 0.03), //The value that the property should be set to
                    100 //The duration in milliseconds that the value is interpolated for
                )
        )
        //Add an action that will return the size of the sphere to its original value when the pointer is moved out of it
        .action(
            (d, n, i) =>
                new BABYLON.InterpolateValueAction(
                    BABYLON.ActionManager.OnPointerOutTrigger,
                    n,
                    "scaling",
                    new Vector3(0.02, 0.02, 0.02),
                    100
                )
        )
        //Add an action that will highlight the sphere mesh using the highlight stencil when the pointer is moved over it,
        //as well as show and properly position the hoverPlane above the sphere mesh
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOverTrigger, () => {
                    logEvent("node onPointerOverTrigger", {paperId: d.paperId, position: n.position});
                    //ExecudeCodeAction allows us to execute a given function
                    setHoverPlaneToNode(d, n);
                    isPointerOver[d.paperId] = true;
                })
        )
        //Add an action that will undo the above when the pointer is moved away from the sphere mesh
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOutTrigger, () => {
                    logEvent("node onPointerOutTrigger", {paperId: d.paperId, position: n.position});
                    //Same as above but in reverse
                    console.log("pointer out");
                    isPointerOver[d.paperId] = false;
                    if (!isDragging[d.paperId]) {
                        setHoverPlaneToNode(null, null);
                    }
                })
        )
        // on pick down action to select ndoes
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickDownTrigger, () => {
                    logEvent("node onPickDownTrigger", {paperId: d.paperId, position: n.position});
                    pickStartTime[d.paperId] = performance.now();
                    shouldDrag[d.paperId] = false;
                    setTimeout(() => {
                        if (isDragging[d.paperId] && !shouldDrag[d.paperId]) {
                            logEvent("node onPickDownTrigger - long press detected", {paperId: d.paperId, position: n.position});
                            updatePaperPanelToNode(d, n);
                        }
                    }, CLICK_DELAY_THRESHOLD);
                })
        )
        // on pick up action for selecting nodes
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickUpTrigger, () => {
                    logEvent("node onPickUpTrigger", {paperId: d.paperId, position: n.position});
                    console.log("pick up");

                    if (!shouldDrag[d.paperId]) {
                        const pickDuration = performance.now() - pickStartTime[d.paperId];

                        if (pickDuration < CLICK_DELAY_THRESHOLD) {
                            logEvent("node onPickUpTrigger - short click detected", {paperId: d.paperId, position: n.position});
                            // only process click if it is short

                            if (d.paperId === paperDetailsPanelId) {
                                updatePaperPanelToNode(null, null);
                                if (!selectedIds.includes(d.paperId)) {
                                    selectedIds.push(d.paperId);
                                }
                                highlighter.addMesh(n, Color3.White());
                            } else if (!selectedIds.includes(d.paperId)) {
                                selectedIds.push(d.paperId);
                                highlighter.addMesh(n, Color3.White());
                            } else {
                                removeItem(selectedIds, d.paperId);
                                highlighter.removeMesh(n);
                            }
                        }
                    } else {
                        logEvent("node onPickUpTrigger - node is already being dragged", {paperId: d.paperId, position: n.position});
                    }
                })
        );

    // Add SixDofDrag behavior
    nodes.run((d, n, i) => {
        let dragBehavior = new BABYLON.SixDofDragBehavior();

        let initialPosition = null;
        shouldDrag[d.paperId] = false;

        dragBehavior.dragDeltaRatio = 0.5;
        dragBehavior.rotateDraggedObject = true;
        dragBehavior.detachCameraControls = true;

        dragBehavior.onDragStartObservable.add((data) => {
            logEvent("node drag onDragStartObservable", {paperId: d.paperId, position: n.position});
            isDragging[d.paperId] = true;
            initialPosition = n.position.clone();
        });
        dragBehavior.onPositionChangedObservable.add((data) => {
            let delta = n.position.subtract(initialPosition);
            if (delta.length() > 0.02) {
                shouldDrag[d.paperId] = true;
            }
            d.x = n.position.x;
            d.y = n.position.y;
            d.z = n.position.z;

            // Fix node in place by reducing its velocity in the simulation
            d.fx = n.position.x;
            d.fy = n.position.y;
            d.fz = n.position.z;

            if (!pinnedNodeIds.includes(d.paperId)) {
                pinnedNodeIds.push(d.paperId);
            }

            logEvent("node drag onPositionChangedObservable", {paperId: d.paperId, position: n.position});

            // check distance to other currently dragged nodes
            paperData.forEach((other) => {
                if (other.paperId !== d.paperId && (false || isDragging[other.paperId])) {
                    let dist = new Vector3(other.x, other.y, other.z).subtract(n.position).length();
                    if (dist < 0.05) {
                        logEvent("node drag onPositionChangedObservable - node proximity connection detected", {paperId: d.paperId, otherPaperId: other.paperId, position: n.position, otherPosition: new Vector3(other.x, other.y, other.z), distance: dist});
                        console.log("Node connection gesture detected");
                        connectNodes(d.paperId, other.paperId);
                        excludeFromNodeConnection.push(d.paperId);
                        excludeFromNodeConnection.push(other.paperId);
                    }
                }
            });
        });
        dragBehavior.onDragObservable.add((data) => {
            logEvent("node drag onDragObservable (drag target changed)", {paperId: d.paperId, nodePosition: n.position});
            if (shouldDrag[d.paperId]) {
                simulation.alpha(0.1);
            }
        });
        dragBehavior.onDragEndObservable.add(() => {
            logEvent("node drag onDragEndObservable", {paperId: d.paperId, position: n.position});
            // Reset node position when drag ended
            console.log("drag end");
            initialPosition = null;
            isDragging[d.paperId] = false;
            shouldDrag[d.paperId] = false;
            unpickTime[d.paperId] = performance.now();
            if (!isPointerOver[d.paperId]) {
                setHoverPlaneToNode(null, null);
            }

            excludeFromNodeConnection.length = 0;

            // Release node from being fixed in place
            // delete d.fx;
            // delete d.fy;
            // delete d.fz;

            // let the simulation relax
            // simulation.alpha(0.1);
        });
        n.addBehavior(dragBehavior);
    });

    nodes.run((d, n, i) => {
        // re-add highlight layer to selected nodes
        if (selectedIds.includes(d.paperId)) {
            highlighter.addMesh(n, Color3.White());
        }
        // re-pin nodes
        if (pinnedNodeIds.includes(d.paperId)) {
            d.fx = d.x;
            d.fy = d.y;
            d.fz = d.z;
        }
    });

    sendAllNodesData();
}

/**
 * Updates the lines in the graph.
 * @param {Array} data - The data to update the lines with.
 * @returns {Array} - The updated lines.
 */
let updateLines = (data) => {
    // console.log("updateLines() called");
    let lines = [];
    data.forEach((v, i) => {
        let start = new Vector3(v.source.x, v.source.y, v.source.z);
        let end = new Vector3(v.target.x, v.target.y, v.target.z);
        lines.push([start, end]);
    });
    return lines;
};

function createLinksFromData(data, color) {
    // logEvent("createLinksFromData() called", {data: data, color: color});
    if (links) {
        links.run((d, n, i) => {
            n.dispose();
        });
    }
    links = CoT.bind(
        "lineSystem",
        {
            lines: (d) => {
                let l = updateLines(d);
                return l;
            },
            updatable: true,
        },
        [data]
    )
        .prop("color", color)
        //.prop("alpha", 0.3)
        .prop("isPickable", false);

    simulation.force("link", forceLink(data).distance(0.1).strength(2));
}
function createLinks() {
    logEvent("createLinks() called", {linkType: linkType});
    if (linkType === "recommendation") {
        createLinksFromData(recommendationLinkData, linkColorMap[linkType]);
    } else if (linkType === "citation") {
        createLinksFromData(citationLinkData, linkColorMap[linkType]);
    } else if (linkType === "author") {
        createLinksFromData(authorLinkData, linkColorMap[linkType]);
    } else if (linkType === "custom") {
        createLinksFromData(userLinkData, linkColorMap[linkType]);
    } else {
        console.error("Invalid link type:", linkType);
    }
}

/**
 * Updates the graph on each simulation tick.
 */
export function ticked() {
    if (nodes) {
        nodes.position((d) => new Vector3(d.x, d.y, d.z));
    }
    if (links) {
        links.run((d, n) =>
            anu.create(
                "lineSystem",
                "edge",
                { lines: updateLines(d), instance: n, updatable: true },
                d
            )
        );
    }
}

export function clearNodeSelection() {
    logEvent("clearNodeSelection() called", {selectedIds: selectedIds});
    console.log("clearNodeSelection() called");
    selectedIds.length = 0;
    nodes.run((d, n, i) => {
        highlighter.removeMesh(n);
    });
}

export function unpinNodes() {
    logEvent("unpinNodes() called", {pinnedNodeIds: pinnedNodeIds});
    console.log("unpinNodes() called");
    pinnedNodeIds.length = 0;
    paperData.forEach((d) => {
        delete d.fx;
        delete d.fy;
        delete d.fz;
    });
}

/**
 * Fetches recommendations and adds new nodes.
 */
export async function addRecommendationsFromSelectedPapers() {
    logEvent("addRecommendationsFromSelectedPapers() called", {selectedIds: selectedIds});
    if (waitingForAPI) {
        logEvent("addRecommendationsFromSelectedPapers() - not requesting, waiting for API", {selectedIds: selectedIds});
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;
    const recommendationSourceIds = selectedIds.slice();

    // adjust glow layers
    nodes.run((d, n, i) => {
        if (selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
            highlighter.addMesh(n, Color3.Yellow());
        }
    });

    try {
        const d = await APIUtils.fetchRecsFromMultipleIds(selectedIds);
        const recommendedPaperIds = d.recommendedPapers.map((a) => a.paperId);

        paperData.forEach((p) => {
            if (selectedIds.includes(p.paperId)) {
                recommendedPaperIds.forEach((rec) => {
                    if (!p.recommends.includes(rec)) {
                        p.recommends.push(rec);
                    }
                });
            }
        });

        const filteredRecommendedPaperIds = recommendedPaperIds.filter(
            (id) => !paperIds.includes(id) && !removedPaperIds.includes(id)
        );
        const newPapers = await APIUtils.getDetailsForMultiplePapers(
            filteredRecommendedPaperIds.slice(0, 5)
        );

        selectedIds.length = 0;
        if (paperDetailsPanelId) {
            selectedIds.push(paperDetailsPanelId);
        }
        // recommendedPapers.forEach((p) => selectedIds.push(p));

        addPapersToGraph(newPapers);
        setLinkType("recommendation");
    } catch (error) {
        logEvent("addRecommendationsFromSelectedPapers() failed", {error: error});
        console.error("addRecommendationsFromSelectedPapers() failed with error:", error);
        setFullScreenUIText("No available papers to add");
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
            if (!selectedIds.includes(d.paperId)) {
                highlighter.removeMesh(n);
            } else if (d.paperId === paperDetailsPanelId) {
                highlighter.addMesh(n, Color3.Blue());
            }
        }
    });
}

/**
 * Adds new papers to the graph.
 */
export function addPapersToGraph(newPapers) {
    logEvent("addPapersToGraph() called", {newPapers: newPapers, prevPaperData: paperData});
    if (!newPapers || newPapers.length === 0) {
        logEvent("addPapersToGraph() failed - newPapers must be a valid non-empty list", {newPapers: newPapers});
        return;
    }

    // Notes:
    // 1) Nodes might need to be locked in place prior to adding to simulation,
    // since we don't want nodes to move around wildly when adding new ones
    //
    // 2) createNodes() can only be called after nodes are added to simulation since
    // it relies on the x, y, z positions of the nodes which is initialized by the simulation

    // Add new papers to paperData
    const newColor = BABYLON.Color3.Random();
    const newPaperIds = [];
    newPapers.forEach((p) => {
        if (!paperData.find((d) => d.paperId === p.paperId)) {
            // don't add duplicates
            p.color = newColor;
            paperData.push(p);
            paperIds.push(p.paperId);
            newPaperIds.push(p.paperId);
        }
    });

    const newPositions = generateFibonacciLatticePositions(
        newPaperIds.length,
        new Vector3(0, 0, 0),
        0.2
    );
    for (let i = 0; i < newPaperIds.length; i++) {
        let j = paperData.length - newPaperIds.length + i;
        paperData[j].x = newPositions[i].x;
        paperData[j].y = newPositions[i].y;
        paperData[j].z = newPositions[i].z;
    }

    paperData.forEach((d) => {
        // lock nodes in place before simulation
        d.fx = d.x;
        d.fy = d.y;
        d.fz = d.z;
    });
    simulation.nodes(paperData);
    simulation.alpha(0.1);
    paperData.forEach((d) => {
        // undo lock nodes in place after simulation
        if (!pinnedNodeIds.includes(d.paperId)) {
            delete d.fx;
            delete d.fy;
            delete d.fz;
        }
    });

    createNodes(paperData);
    generateLinkData(paperData);

    // createLinksFromData(useCitationLinks ? citationLinkData : recommendationLinkData);
    createLinks();

    // recommendationLinkData.forEach((d) => {
    //     console.log(d);
    // });
    // citationLinkData.forEach((d) => {
    //     console.log(d);
    // });

    nodes.run((d, n, i) => {
        if (newPaperIds.includes(d.paperId)) {
            highlighter.addMesh(n, Color3.FromHexString("#7CFC00"));
        }
    });

    setTimeout(() => {
        nodes.run((d, n, i) => {
            if (newPaperIds.includes(d.paperId) && !selectedIds.includes(d.paperId)) {
                highlighter.removeMesh(n);
            }
        });
    }, 3000);

    simulation.alpha(0.2);

    logEvent("addPapersToGraph() finished", {newPapers: newPapers, currPaperData: paperData});
}

/**
 * Removes selected nodes from the graph.
 */
export function removeSelectedNodesFromGraph() {
    logEvent("removeSelectedNodesFromGraph() called", {selectedIds: selectedIds});
    removeNodesFromGraph(selectedIds);
    removedPaperIds.push(...selectedIds);
    selectedIds.length = 0;
}

/**
 * Removes nodes from the graph.
 */
export function removeNodesFromGraph(idsToRemove) {
    logEvent("removeNodesFromGraph() called", {idsToRemove: idsToRemove, paperData: paperData});
    console.log("remove nodes from graph called");
    console.log("idsToRemove", idsToRemove);
    console.log("paperData", paperData);
    const newPaperData = paperData.filter((p) => !idsToRemove.includes(p.paperId));
    const newPaperIds = paperIds.filter((id) => !idsToRemove.includes(id));
    const newCitationLinkData = citationLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );
    const newRecommendationLinkData = recommendationLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );
    const newAuthorLinkData = authorLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );
    const newUserLinkData = userLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );

    paperData.length = 0;
    paperIds.length = 0;
    citationLinkData.length = 0;
    recommendationLinkData.length = 0;
    authorLinkData.length = 0;
    userLinkData.length = 0;

    paperData.push(...newPaperData);
    paperIds.push(...newPaperIds);
    citationLinkData.push(...newCitationLinkData);
    recommendationLinkData.push(...newRecommendationLinkData);
    authorLinkData.push(...newAuthorLinkData);
    userLinkData.push(...newUserLinkData);

    idsToRemove.forEach((id) => {
        if (pinnedNodeIds.includes(id)) {
            removeItem(pinnedNodeIds, id);
        }
    });

    // paperData = paperData.filter((p) => !idsToRemove.includes(p.paperId));
    // citationLinkData = citationLinkData.filter((link) => !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId));
    // recommendationLinkData = recommendationLinkData.filter((link) => !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId));

    console.log("paperData", paperData);

    createNodes();
    // createLinksFromData(useCitationLinks ? citationLinkData : recommendationLinkData);
    createLinks();

    logEvent("removeNodesFromGraph() finished", {newPaperData: paperData});
}

/**
 * Toggles between citation and recommendation links.
 */
export function changeLinkType() {
    console.log("toggleLinkType() called");
    // useCitationLinks = !useCitationLinks;
    // createLinksFromData(useCitationLinks ? citationLinkData : recommendationLinkData);
    // // ticked();

    if (linkType === "recommendation") {
        logEvent("changeLinkType() called", {currentLinkType: linkType, newLinkType: "citation"});
        linkType = "citation";
    } else if (linkType === "citation") {
        logEvent("changeLinkType() called", {currentLinkType: linkType, newLinkType: "author"});
        linkType = "author";
    } else if (linkType === "author") {
        logEvent("changeLinkType() called", {currentLinkType: linkType, newLinkType: "custom"});
        linkType = "custom";
    } else if (linkType === "custom") {
        logEvent("changeLinkType() called", {currentLinkType: linkType, newLinkType: "recommendation"});
        linkType = "recommendation";
    } else {
        logEvent("changeLinkType() called - invalid link type", {linkType: linkType});
        console.error("Invalid link type:", linkType);
    }
    setFullScreenUIText(`Link Type ${linkType}`);
    createLinks();
}

export function setLinkType(type) {
    logEvent("setLinkType() called", {currLinkType: linkType, newLinkType: type});
    if (
        type !== "recommendation" &&
        type !== "citation" &&
        type !== "author" &&
        linkType !== "custom"
    ) {
        logEvent("setLinkType() called - invalid link type", {linkType: type});
        console.error("Invalid link type:", type);
        return;
    }
    linkType = type;
    setFullScreenUIText(`Link Type ${linkType}`);
    createLinks();
}

export async function addCitationsFromSelectedPaper() {
    logEvent("addCitationsFromSelectedPaper() called", {selectedIds: selectedIds, currPaperData: paperData});
    if (selectedIds.length !== 1) {
        logEvent("addCitationsFromSelectedPaper() failed - must select exactly one paper", {selectedIds: selectedIds});
        console.error("Error: Must select exactly one paper to fetch citations for.");
        return;
    }

    if (waitingForAPI) {
        logEvent("addCitationsFromSelectedPaper() - not requesting, waiting for API", {selectedIds: selectedIds});
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;

    const recommendationSourceIds = [selectedIds[0]];

    // adjust glow layers
    nodes.run((d, n, i) => {
        if (selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
            highlighter.addMesh(n, Color3.Yellow());
        }
    });

    try {
        const paperId = selectedIds[0];
        selectedIds.length = 0;
        if (paperDetailsPanelId) {
            selectedIds.push(paperDetailsPanelId);
        }
        const citationsResponse = await APIUtils.getCitationsForPaper(paperId);
        const citationIds = citationsResponse.data.map((d) => d.citingPaper.paperId);
        const filteredCitationsIds = citationIds.filter(
            (id) => !paperIds.includes(id) && !removedPaperIds.includes(id)
        );
        const newPapers = await APIUtils.getDetailsForMultiplePapers(
            filteredCitationsIds.slice(0, 5)
        );

        addPapersToGraph(newPapers);
        setLinkType("citation");
    } catch (error) {
        logEvent("addCitationsFromSelectedPaper() failed", {error: error});
        console.error("addCitationsFromSelectedPaper() failed with error:", error);
        setFullScreenUIText("No available papers to add");
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
            if (!selectedIds.includes(d.paperId)) {
                highlighter.removeMesh(n);
            } else if (d.paperId === paperDetailsPanelId) {
                highlighter.addMesh(n, Color3.Blue());
            }
        }
    });

    logEvent("addCitationsFromSelectedPaper() finished", {selectedIds: selectedIds, paperData: paperData});
}

export async function addReferencesFromSelectedPaper() {
    logEvent("addReferencesFromSelectedPaper() called", {selectedIds: selectedIds, currPaperData: paperData});
    if (selectedIds.length !== 1) {
        logEvent("addReferencesFromSelectedPaper() failed - must select exactly one paper", {selectedIds: selectedIds});
        console.error("Error: Must select exactly one paper to fetch references for.");
        return;
    }

    if (waitingForAPI) {
        logEvent("addReferencesFromSelectedPaper() - not requesting, waiting for API", {selectedIds: selectedIds});
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;

    const recommendationSourceIds = [selectedIds[0]];

    // adjust glow layers
    nodes.run((d, n, i) => {
        if (selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
            highlighter.addMesh(n, Color3.Yellow());
        }
    });

    try {
        const paperId = selectedIds[0];
        selectedIds.length = 0;
        if (paperDetailsPanelId) {
            selectedIds.push(paperDetailsPanelId);
        }
        const referencesResponse = await APIUtils.getReferencesForPaper(paperId);
        const referenceIds = referencesResponse.data.map((d) => d.citedPaper.paperId);
        const filteredReferenceIds = referenceIds.filter(
            (id) => !paperIds.includes(id) && !removedPaperIds.includes(id)
        );
        console.log("filteredReferenceIds", filteredReferenceIds);
        const newPapers = await APIUtils.getDetailsForMultiplePapers(
            filteredReferenceIds.slice(0, 5)
        );

        addPapersToGraph(newPapers);
        setLinkType("citation");
    } catch (error) {
        logEvent("addReferencesFromSelectedPaper() failed", {error: error});
        console.error("addReferencesFromSelectedPaper() failed with error:", error);
        setFullScreenUIText("No available papers to add");
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
            if (!selectedIds.includes(d.paperId)) {
                highlighter.removeMesh(n);
            } else if (d.paperId === paperDetailsPanelId) {
                highlighter.addMesh(n, Color3.Blue());
            }
        }
    });

    logEvent("addReferencesFromSelectedPaper() finished", {selectedIds: selectedIds, paperData: paperData});
}

export async function addPapersFromAuthor(authorId) {
    logEvent("addPapersFromAuthor() called", {authorId: authorId, currPaperData: paperData});
    if (!authorId) {
        logEvent("addPapersFromAuthor() failed - authorId must be a non-empty string", {authorId: authorId});
        console.error("Error: authorId must be a non-empty string.");
        setFullScreenUIText("No available papers to add");
        return;
    }

    if (waitingForAPI) {
        logEvent("addPapersFromAuthor() - not requesting, waiting for API", {authorId: authorId});
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;

    const recommendationSourceIds = paperData
        .filter((d) => d.authors.some((a) => a.authorId === authorId))
        .map((d) => d.paperId);

    // adjust glow layers
    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
            highlighter.addMesh(n, Color3.Yellow());
        }
    });

    try {
        const authorResponse = await APIUtils.getAuthorsPapers(authorId);
        const authorPaperIds = authorResponse.data.map((d) => d.paperId);
        const filteredAuthorPaperIds = authorPaperIds.filter(
            (id) => !paperIds.includes(id) && !removedPaperIds.includes(id)
        );
        const newPapers = await APIUtils.getDetailsForMultiplePapers(
            filteredAuthorPaperIds.slice(0, 5)
        );

        addPapersToGraph(newPapers);
        setLinkType("author");
    } catch (error) {
        logEvent("addPapersFromAuthor() failed", {error: error});
        console.error("addReferencesFromSelectedPaper() failed with error:", error);
        setFullScreenUIText("No available papers to add");
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
            if (!selectedIds.includes(d.paperId)) {
                highlighter.removeMesh(n);
            } else if (d.paperId === paperDetailsPanelId) {
                highlighter.addMesh(n, Color3.Blue());
            }
        }
    });

    logEvent("addPapersFromAuthor() finished", {authorId: authorId, selectedIds: selectedIds, paperData: paperData});
}

export async function restoreDeletedPapers() {
    logEvent("restoreDeletedPapers() called", {removedPaperIds: removedPaperIds, currPaperData: paperData});
    if (waitingForAPI) {
        logEvent("restoreDeletedPapers() - not requesting, waiting for API", {removedPaperIds: removedPaperIds});
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;
    try {
        const deletedPapers = await APIUtils.getDetailsForMultiplePapers(removedPaperIds);
        addPapersToGraph(deletedPapers);
        removedPaperIds.length = 0;
    } catch (error) {
        logEvent("restoreDeletedPapers() failed", {error: error});
        console.error("restoreDeletedPapers() failed with error:", error);
    }
    waitingForAPI = false;

    logEvent("restoreDeletedPapers() finished", {removedPaperIds: removedPaperIds, paperData: paperData});
}

function regenerateUserLinkData() {
    const oldUserLinkData = userLinkData.slice();
    userLinkData.length = 0;
    userConnections.forEach(([a, b]) => {
        if (paperIds.includes(a) && paperIds.includes(b)) {
            userLinkData.push({
                source: paperData.find((d) => d.paperId === a),
                target: paperData.find((d) => d.paperId === b),
            });
        }
    });

    logEvent("regenerateUserLinkData() called", {oldUserLinkData: oldUserLinkData, newUserLinkData: userLinkData});
}

export function connectSelectedNodes() {
    logEvent("connectSelectedNodes() called", {selectedIds: selectedIds});
    console.log("connectSelectedNodes() called");

    if (selectedIds.length !== 2) {
        logEvent("connectSelectedNodes() failed - must select exactly two papers", {selectedIds: selectedIds});
        console.error("Error: Must select exactly two papers to connect.");
        return;
    }

    const paperId1 = selectedIds[0];
    const paperId2 = selectedIds[1];

    connectNodes(paperId1, paperId2);
}

export function connectNodes(paperId1, paperId2) {
    logEvent("connectNodes() called", {paperId1: paperId1, paperId2: paperId2, paper1Position: paperData.find((d) => d.paperId === paperId1), paper2Position: paperData.find((d) => d.paperId === paperId2)});
    if (
        excludeFromNodeConnection.includes(paperId1) ||
        excludeFromNodeConnection.includes(paperId2)
    ) {
        logEvent("connectNodes() failed - nodes excluded from connection", {paperId1: paperId1, paperId2: paperId2, excludeFromNodeConnection: excludeFromNodeConnection});
        console.log("nodes excluded from connection");
        return;
    }

    // if nodes are already connected
    let i = userConnections.findIndex(
        ([a, b]) => (a === paperId1 && b === paperId2) || (a === paperId2 && b === paperId1)
    );
    if (i !== -1) {
        logEvent("connectNodes() - nodes already connected", {paperId1: paperId1, paperId2: paperId2, userConnections: userConnections});
        if (linkType === "custom") {
            logEvent("connectNodes() - removing existing connection", {paperId1: paperId1, paperId2: paperId2});
            console.log("nodes already connected");
            userConnections.splice(i, 1);
            regenerateUserLinkData();
            createLinks();
        } else {
            logEvent("connectNodes() - nodes already connected, but not custom link type, switching to linkType = custom", {paperId1: paperId1, paperId2: paperId2, prevLinkType: linkType});
            linkType = "custom";
        }
    } else {
        logEvent("connectNodes() - creating new connection", {paperId1: paperId1, paperId2: paperId2});
        userConnections.push([paperId1, paperId2]);
        const p1 = paperData.find((d) => d.paperId === paperId1);
        const p2 = paperData.find((d) => d.paperId === paperId2);

        if (p1 && p2) {
            userLinkData.push({ source: p1, target: p2 });
        }
        linkType = "custom";
        createLinks();
    }
}

function generateFibonacciLatticePositions(n, center, radius) {
    // Fibonacci Lattice https://observablehq.com/@meetamit/fibonacci-lattices
    const positions = [];
    const randOffset = 2 * Math.PI * Math.random();
    const goldenAngle = 0.5 * (1 + Math.sqrt(5)); // golden angle for even distribution
    for (let i = 0; i < n; i++) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / n); // latitude angle
        const theta = (goldenAngle * i + randOffset) % (2 * Math.PI); // longitude angle
        positions.push(
            new Vector3(
                center.x + radius * Math.sin(phi) * Math.cos(theta),
                center.y + radius * Math.sin(phi) * Math.sin(theta),
                center.z + radius * Math.cos(phi)
            )
        );
    }
    logEvent("generateFibonacciLatticePositions() called", {n: n, center: center, radius: radius, positions: positions});
    return positions;
}

export async function createClustersFromGemini(response) {
    logEvent("createClustersFromGemini() called", {response: response});
    console.log("createClustersFromGemini() called");

    try {
        console.log("clusters received from gemini:", response);
        // const data = JSON.parse(response);
        const clusterAssignments = response.map((cluster) => cluster.paperIds);
        const clusterNames = response.map((cluster) => cluster.name);

        // const clusterAssignments = [[], [], []];
        // paperIds.forEach((id, i) => {
        //     clusterAssignments[i % 3].push(id);
        // });
        // const clusterNames = ["A", "B", "C"];

        const majorClusterSphereRadius = 0.25;
        const minorClusterSphereRadius = 0.08;
        const clusterCount = clusterAssignments.length;

        const clusterCenters = generateFibonacciLatticePositions(
            clusterCount,
            new Vector3(0, 0, 0),
            majorClusterSphereRadius
        );
        const nodePositions = []; // 2d array of node positions for each cluster
        clusterAssignments.forEach((ids, i) => {
            const positions = generateFibonacciLatticePositions(
                ids.length,
                clusterCenters[i],
                minorClusterSphereRadius
            );
            nodePositions.push(positions);
        });

        // animate position movement
        clusterAssignments.forEach((ids, i) => {
            const positions = nodePositions[i];
            ids.forEach((id, j) => {
                const d = paperData.find((d) => d.paperId === id);
                const startPos = new BABYLON.Vector3(d.x, d.y, d.z);
                const endPos = j > 0 ? positions[j].clone() : clusterCenters[i].clone();
                animateNodeData(d, startPos, endPos, 1000); // 1000ms = 1s animation
            });
        });

        pinnedNodeIds.push(...paperIds);

        // assign cluster names
        clusterAssignments.forEach((ids, i) => {
            const clusterName = clusterNames[i];
            ids.forEach((id) => {
                const d = paperData.find((d) => d.paperId === id);
                d.clusterName = clusterName;
            });
        });

        // create links between elements in cluster
        userConnections.length = 0;
        clusterAssignments.forEach((cluster) => {
            const id0 = cluster[0]
            cluster.forEach((id1, i) => {
                if (i > 0) {
                    let k = userConnections.findIndex(
                        ([a, b]) => (a === id0 && b === id1) || (a === id1 && b === id0)
                    );
                    if (k === -1) {
                        userConnections.push([id0, id1]);
                    }
                }
            });
        });

        linkType = "custom";
        regenerateUserLinkData();
        createLinks();
    } catch (error) {
        logEvent("createClustersFromGemini() failed", {error: error});
        console.error("createClustersFromGemini() failed with error:", error);
        return;
    }

    logEvent("createClustersFromGemini() finished", {response: response, paperData: paperData});
}

export async function testCreateClusters() {
    logEvent("testCreateClusters() called", {});
    console.log("test createClusters() called");

    const clusterAssignments = [[], [], []];
    paperIds.forEach((id, i) => {
        clusterAssignments[i % 3].push(id);
    });
    const clusterNames = ["A", "B", "C"];

    const majorClusterSphereRadius = 0.25;
    const minorClusterSphereRadius = 0.08;
    const clusterCount = clusterAssignments.length;

    const clusterCenters = generateFibonacciLatticePositions(
        clusterCount,
        new Vector3(0, 0, 0),
        majorClusterSphereRadius
    );
    const nodePositions = []; // 2d array of node positions for each cluster
    clusterAssignments.forEach((ids, i) => {
        const positions = generateFibonacciLatticePositions(
            ids.length,
            clusterCenters[i],
            minorClusterSphereRadius
        );
        nodePositions.push(positions);
    });

    clusterAssignments.forEach((ids, i) => {
        const positions = nodePositions[i];
        ids.forEach((id, j) => {
            const d = paperData.find((d) => d.paperId === id);
            const startPos = new BABYLON.Vector3(d.x, d.y, d.z);
            const endPos = new BABYLON.Vector3(positions[j].x, positions[j].y, positions[j].z);
            animateNodeData(d, startPos, endPos, 1000); // 1000ms = 1s animation
        });
    });

    pinnedNodeIds.push(...paperIds);

    // assign cluster names
    clusterAssignments.forEach((ids, i) => {
        const clusterName = clusterNames[i];
        ids.forEach((id) => {
            const d = paperData.find((d) => d.paperId === id);
            d.clusterName = clusterName;
        });
    });

    // create links between elements in cluster
    userConnections.length = 0;
    clusterAssignments.forEach((cluster) => {
        const id0 = cluster[0]
        cluster.forEach((id1, i) => {
            if (i > 0) {
                let k = userConnections.findIndex(
                    ([a, b]) => (a === id0 && b === id1) || (a === id1 && b === id0)
                );
                if (k === -1) {
                    userConnections.push([id0, id1]);
                }
            }
        });
    });

    linkType = "custom";
    regenerateUserLinkData();
    createLinks();

    logEvent("testCreateClusters() finished", {paperData: paperData});
}

function animateNodeData(d, startPos, endPos, duration = 1000) {
    const startTime = performance.now();

    const observer = scene.onBeforeRenderObservable.add(() => {
        const elapsed = performance.now() - startTime;
        let t = Math.min(elapsed / duration, 1); // Normalize t between 0 and 1

        t = t * (2 - t);

        // Smooth interpolation (linear, but can be adjusted)
        d.fx = startPos.x + (endPos.x - startPos.x) * t;
        d.fy = startPos.y + (endPos.y - startPos.y) * t;
        d.fz = startPos.z + (endPos.z - startPos.z) * t;

        // Stop updating once the animation is complete
        if (t >= 1) {
            scene.onBeforeRenderObservable.remove(observer);
        }
    });
}

export function sendAllNodesData() {
    logEvent("sendAllNodesData() called", {paperData: paperData});
    const payload = [];
    paperData.forEach((d) => {
        payload.push({ paperId: d.paperId, title: d.title, abstract: d.abstract });
    });

    // Emit the "sendAllNodesData" event using socket from the socket-connection module
    if (typeof socket !== "undefined" && socket.connected) {
        socket.emit("sendAllNodesData", payload);
        console.log("Emitted 'sendAllNodesData' event with payload:", payload);
    } else {
        logEvent("sendAllNodesData() failed - socket not available or not connected", {});
        console.error(
            "Socket is not available or not connected. 'sendAllNodesData' event not emitted."
        );
    }
}

export function sendCurrentlyViewingNodeData() {
    const currentlyViewingPaper = paperData.find((d) => paperDetailsPanelId === d.paperId);
    logEvent("sendCurrentlyViewingNodeData() called", {currentlyViewingPaper: currentlyViewingPaper});
    if (currentlyViewingPaper) {
        const payload = {
            paperId: currentlyViewingPaper.paperId,
            title: currentlyViewingPaper.title,
            abstract: currentlyViewingPaper.abstract || "",
        };

        // Emit the "sendPaperData" event using socket from the socket-connection module
        if (typeof socket !== "undefined" && socket.connected) {
            socket.emit("sendCurrentlyViewingNodeData", payload);
            // console.log("Emitted 'sendCurrentlyViewingNodeData' event with payload:", payload);
        } else {
            logEvent("sendCurrentlyViewingNodeData() failed - socket not available or not connected", {});
            console.error(
                "Socket is not available or not connected. 'sendCurrentlyViewingNodeData' event not emitted."
            );
        }
    }
}

/**
 * Adds a summary for a given paper and updates the global mapping.
 */
export function addSummaryForPaper(summary, paperId) {
    logEvent("addSummaryForPaper() called", {summary: summary, paperId: paperId});
    paperSummaryMap[paperId] = summary;
    updateInsightsAndNotesText(paperId);
}

/**
 * Adds keywords for a given paper and updates the global mapping.
 */
export function addKeywordsForPaper(keywords, paperId) {
    logEvent("addKeywordsForPaper() called", {keywords: keywords, paperId: paperId});
    paperKeywordsMap[paperId] = keywords;
    updateInsightsAndNotesText(paperId);
}

export function addAnnotationsForPaper(annotations, paperId) {
    logEvent("addAnnotationsForPaper() called", {annotations: annotations, paperId: paperId});
    paperAnnotationsMap[paperId] = annotations;
    updateInsightsAndNotesText(paperId);
}

export function clearAnnotationsForPaper(paperId) {
    logEvent("clearAnnotationsForPaper() called", {paperId: paperId});
    paperAnnotationsMap[paperId] = null;
    updateInsightsAndNotesText(paperId, true);
}