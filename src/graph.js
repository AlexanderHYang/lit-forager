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
} from "./graphics.js"; // Import shared scene from graphics.js

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
    "citation": Color3.Magenta(),
    "recommendation": Color3.White(),
    "author" : Color3.Yellow(),
    "custom": Color3.Green(),
};

// Initialize force simulation
export let simulation;

/**
 * Fetches the initial set of papers.
 */
export async function fetchInitialPapers() {
    waitingForAPI = true;
    try {
        let data = await APIUtils.getDetailsForMultiplePapers([
            "f9c602cc436a9ea2f9e7db48c77d924e09ce3c32",
        ]);
        if (!Array.isArray(data)) {
            data = [
                {
                    paperId: "f9c602cc436a9ea2f9e7db48c77d924e09ce3c32",
                    references: [],
                    recommends: [],
                },
            ];
        }
        paperData.push(...data);
    } catch (error) {
        console.error("Failed to fetch initial papers", error);
        paperData.push({
            paperId: "f9c602cc436a9ea2f9e7db48c77d924e09ce3c32",
            references: [],
            recommends: [],
        });
    }
    paperIds.push("f9c602cc436a9ea2f9e7db48c77d924e09ce3c32");
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

export function startSimulationRendering() {
    // force simulation to step every frame
    scene.onBeforeRenderObservable.add(() => {
        // simulation.step();
        simulation.tick();
        ticked();
    });
}

/**
 * Creates link data from paperData.
 */
export function generateLinkData() {
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
                if (userConnections.some(([a, b]) => (a === d1.paperId && b === d2.paperId) || (a === d2.paperId && b === d1.paperId))) {
                    userLinkData.push({ source: d1, target: d2 });
                }
            }
        });
    });
}

const scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor4());

/**
 * Creates and updates nodes in the Babylon.js scene.
 */
export function createNodes() {
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
                    //ExecudeCodeAction allows us to execute a given function
                    setHoverPlaneToNode(d, n);
                    isPointerOver[d.paperId] = true;
                })
        )
        //Add an action that will undo the above when the pointer is moved away from the sphere mesh
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOutTrigger, () => {
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
                    pickStartTime[d.paperId] = performance.now();
                    shouldDrag[d.paperId] = false;
                    setTimeout(() => {
                        if (isDragging[d.paperId] && !shouldDrag[d.paperId]) { 
                            updatePaperPanelToNode(d,n);
                        }
                    }, CLICK_DELAY_THRESHOLD);
                })
        )
        // on pick up action for selecting nodes
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickUpTrigger, () => {
                    console.log("pick up");

                    if (!shouldDrag[d.paperId]) {
                        const pickDuration = performance.now() - pickStartTime[d.paperId];

                        if (pickDuration < CLICK_DELAY_THRESHOLD) {
                            // only process click if it is short
                            if (!selectedIds.includes(d.paperId)) {
                                selectedIds.push(d.paperId);
                                highlighter.addMesh(n, Color3.White());
                            } else {
                                removeItem(selectedIds, d.paperId);
                                highlighter.removeMesh(n);
                            }
                        }
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

            // check distance to other currently dragged nodes
            paperData.forEach((other) => {
                if (other.paperId !== d.paperId && (false || isDragging[other.paperId])) {
                    let dist = new Vector3(other.x, other.y, other.z).subtract(n.position).length();
                    if (dist < 0.05) {
                        console.log("Node connection gesture detected");
                        connectNodes(d.paperId, other.paperId);
                        excludeFromNodeConnection.push(d.paperId);
                        excludeFromNodeConnection.push(other.paperId);
                    }
                }
            });
        });
        dragBehavior.onDragObservable.add((data) => {
            if (shouldDrag[d.paperId]) {
                simulation.alpha(0.1);
            }
        });
        dragBehavior.onDragEndObservable.add(() => {
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
    console.log("clearNodeSelection() called");
    selectedIds.length = 0;
    nodes.run((d, n, i) => {
        highlighter.removeMesh(n);
    });
}

export function unpinNodes() {
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
    if (waitingForAPI) {
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;
    const recommendationSourceIds = selectedIds.splice();

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

        const filteredRecommendedPaperIds = recommendedPaperIds.filter((id) => !paperIds.includes(id) && !removedPaperIds.includes(id));
        const newPapers = await APIUtils.getDetailsForMultiplePapers(filteredRecommendedPaperIds.slice(0,5));

        selectedIds.length = 0;
        // recommendedPapers.forEach((p) => selectedIds.push(p));

        addPapersToGraph(newPapers);
        setLinkType("recommendation");
    } catch (error) {
        console.error("addRecommendationsFromSelectedPapers() failed with error:", error);
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId) && !selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
        }
    });
}

/**
 * Adds new papers to the graph.
 */
export function addPapersToGraph(newPapers) {
    if (!newPapers || newPapers.length === 0) return;

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
}

/**
 * Removes selected nodes from the graph.
 */
export function removeSelectedNodesFromGraph() {
    removeNodesFromGraph(selectedIds);
    removedPaperIds.push(...selectedIds);
    selectedIds.length = 0;
}

/**
 * Removes nodes from the graph.
 */
export function removeNodesFromGraph(idsToRemove) {
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
}

/**
 * Toggles between citation and recommendation links.
 */
export function toggleLinkType() {
    console.log("toggleLinkType() called");
    // useCitationLinks = !useCitationLinks;
    // createLinksFromData(useCitationLinks ? citationLinkData : recommendationLinkData);
    // // ticked();

    if (linkType === "recommendation") {
        linkType = "citation";
    } else if (linkType === "citation") {
        linkType = "author";
    } else if (linkType === "author") {
        linkType = "custom";
    } else if (linkType === "custom") {
        linkType = "recommendation";
    } else {
        console.error("Invalid link type:", linkType);
    }
    setFullScreenUIText(`Link Type ${linkType}`);
    createLinks();
}

export function setLinkType(type) {
    if (type !== "recommendation" && type !== "citation" && type !== "author" && linkType !== "custom") {
        console.error("Invalid link type:", type);
        return;
    }
    linkType = type;
    setFullScreenUIText(`Link Type ${linkType}`);
    createLinks();
}

export async function addCitationsFromSelectedPaper() {
    if (selectedIds.length !== 1) {
        console.error("Error: Must select exactly one paper to fetch citations for.");
        return;
    }

    if (waitingForAPI) {
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
        const citationsResponse = await APIUtils.getCitationsForPaper(paperId);
        const citationIds = citationsResponse.data.map((d) => d.citingPaper.paperId);
        const filteredCitationsIds = citationIds.filter((id) => !paperIds.includes(id) && !removedPaperIds.includes(id));
        const newPapers = await APIUtils.getDetailsForMultiplePapers(filteredCitationsIds.slice(0,5));

        addPapersToGraph(newPapers);
        setLinkType("citation");
    } catch (error) {
        console.error("addCitationsFromSelectedPaper() failed with error:", error);
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId) && !selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
        }
    });
}

export async function addReferencesFromSelectedPaper() {
    if (selectedIds.length !== 1) {
        console.error("Error: Must select exactly one paper to fetch references for.");
        return;
    }

    if (waitingForAPI) {
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
        const referencesResponse = await APIUtils.getReferencesForPaper(paperId);
        const referenceIds = referencesResponse.data.map((d) => d.citedPaper.paperId);
        const filteredReferenceIds = referenceIds.filter((id) => !paperIds.includes(id) && !removedPaperIds.includes(id));
        console.log("filteredReferenceIds", filteredReferenceIds);
        const newPapers = await APIUtils.getDetailsForMultiplePapers(filteredReferenceIds.slice(0,5));

        addPapersToGraph(newPapers);
        setLinkType("citation");
    } catch (error) {
        console.error("addReferencesFromSelectedPaper() failed with error:", error);
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId) && !selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
        }
    });
}

export async function addPapersFromAuthor(authorId) {
    if (!authorId) {
        console.error("Error: authorId must be a non-empty string.");
        return;
    }

    if (waitingForAPI) {
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;

    const recommendationSourceIds = paperData.filter((d) => d.authors.some((a) => a.authorId === authorId)).map((d) => d.paperId);

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
        const filteredAuthorPaperIds = authorPaperIds.filter((id) => !paperIds.includes(id) && !removedPaperIds.includes(id));
        const newPapers = await APIUtils.getDetailsForMultiplePapers(filteredAuthorPaperIds.slice(0,5));

        addPapersToGraph(newPapers);
        setLinkType("author");
    } catch (error) {
        console.error("addReferencesFromSelectedPaper() failed with error:", error);
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId) && !selectedIds.includes(d.paperId)) {
            highlighter.removeMesh(n);
        }
    });
}

export async function restoreDeletedPapers() {
    if (waitingForAPI) {
        console.log("not requesting, already waiting for API");
        return;
    }
    waitingForAPI = true;
    try {
        const deletedPapers = await APIUtils.getDetailsForMultiplePapers(removedPaperIds);
        addPapersToGraph(deletedPapers);
        removedPaperIds.length = 0;
    } catch (error) {
        console.error("restoreDeletedPapers() failed with error:", error);
    }
    waitingForAPI = false;
}

function regenerateUserLinkData() {
    userLinkData.length = 0;
    userConnections.forEach(([a, b]) => {
        if (paperIds.includes(a) && paperIds.includes (b)) {
            userLinkData.push({ source: paperData.find(d => d.paperId === a), target: paperData.find(d => d.paperId === b) });
        }
    });
}

export function connectSelectedNodes() {
    console.log("connectSelectedNodes() called");
    
    if (selectedIds.length !== 2) {
        console.error("Error: Must select exactly two papers to connect.");
        return;
    }

    const paperId1 = selectedIds[0];
    const paperId2 = selectedIds[1];

    connectNodes(paperId1, paperId2);
}

export function connectNodes(paperId1, paperId2) {
    if (excludeFromNodeConnection.includes(paperId1) || excludeFromNodeConnection.includes(paperId2)) {
        console.log("nodes excluded from connection");
        return;
    }

    // if nodes are already connected
    let i = userConnections.findIndex(([a, b]) => (a === paperId1 && b === paperId2) || (a === paperId2 && b === paperId1));
    if (i !== -1) {
        if (linkType === "custom") {
            console.log("nodes already connected");
            userConnections.splice(i, 1);
            regenerateUserLinkData();
            createLinks();
        } else {
            linkType = "custom";
        }
    } else {
        userConnections.push([paperId1, paperId2]);
        userLinkData.push({ source: paperIds.indexOf(paperId1), target: paperIds.indexOf(paperId2) });
        linkType = "custom";
        createLinks();
    }
}

function generateFibonacciLatticePositions(n, center, radius) {
    // Fibonacci Lattice https://observablehq.com/@meetamit/fibonacci-lattices
    const positions = [];
    const randOffset = 2 * Math.PI * Math.random();
    const goldenAngle = Math.PI * (1 + Math.sqrt(5)); // golden angle for even distribution
    for (let i = 0; i < n; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / n); // latitude angle
        const theta = goldenAngle * i + randOffset; // longitude angle
        positions.push(new Vector3(
            center.x + radius * Math.sin(phi) * Math.cos(theta),
            center.y + radius * Math.sin(phi) * Math.sin(theta),
            center.z + radius * Math.cos(phi)
        ));
    }
    return positions;
}

export async function createClusters() {
    console.log("createClusters() called");

    let x = await getClustersFromGemini();

    // random cluster assignments for now
    const clusterAssignment = [[], [], []];
    paperIds.forEach((id, i) => {
        clusterAssignment[i % 3].push(id);
    });
    const clusterNames = ["A", "B", "C"];

    const majorClusterSphereRadius = 0.35;
    const minorClusterSphereRadius = 0.1;
    const clusterCount = 3;

    const clusterCenters = generateFibonacciLatticePositions(clusterCount, new Vector3(0, 0, 0), majorClusterSphereRadius);
    const nodePositions = []; // 2d array of node positions for each cluster
    clusterAssignment.forEach((ids, i) => {
        const positions = generateFibonacciLatticePositions(ids.length, clusterCenters[i], minorClusterSphereRadius);
        nodePositions.push(positions);
    });

    // assign positions to nodes
    clusterAssignment.forEach((ids, i) => {
        const positions = nodePositions[i];
        ids.forEach((id, j) => {
            const d = paperData.find((d) => d.paperId === id);
            d.fx = positions[j].x;
            d.fy = positions[j].y;
            d.fz = positions[j].z;
            d.x = positions[j].x;
            d.y = positions[j].y;
            d.z = positions[j].z;
        });
    });
    pinnedNodeIds.push(...paperIds);

    // assign cluster names
    clusterAssignment.forEach((ids, i) => {
        const clusterName = clusterNames[i];
        ids.forEach((id) => {
            const d = paperData.find((d) => d.paperId === id);
            d.clusterName = clusterName;
        });
    });

    linkType = "custom";
    createLinks();
}

export async function getClustersFromGemini() {
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
- **Do not add extra commentary**—just return the JSON object.
- The response **must be in valid JSON format** with proper syntax.

Now, **process the following input and generate clusters accordingly:**`

    const paperInfo = {papers: []};
    paperData.forEach((d) => {
        paperInfo.papers.push({
            paperId: d.paperId,
            title: d.title,
            abstract: d.abstract,
        });
    });

    const prompt = `${basePrompt}\n\n${JSON.stringify(paperInfo, null, 4)}`;
    console.log(prompt);

    // processing received data
    const data = {
        clusters: [
            {name: "", paperIds: []}
        ]
        };

    const clusterAssignments = data.clusters.map((cluster) => cluster.paperIds);
    const clusterNames = data.clusters.map((cluster) => cluster.name);

    return {clusterAssignments, clusterNames};
}