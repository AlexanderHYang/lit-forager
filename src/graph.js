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
    updateHoverPlaneText,
    setHoverPlaneToNode,
    updatePaperPanelToNode,
    updatePaperPanelOnDrag,
} from "./graphics.js"; // Import shared scene from graphics.js

// Shared graph data
export const paperData = [];
export const citationLinkData = [];
export const recommendationLinkData = [];
export let useCitationLinks = false;
export const selectedIds = [];
export let nodes = null;
export let links = null;
const pickStartTime = {};
const unpickTime = {};
const shouldDrag = {};
const isDragging = {};
const CLICK_DELAY_THRESHOLD = 400; // milliseconds
export let waitingForAPI = false;

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
export function createLinkData() {
    citationLinkData.length = 0;
    recommendationLinkData.length = 0;
    paperData.forEach((d1, i) => {
        paperData.forEach((d2, j) => {
            if (d1.paperId !== d2.paperId) {
                d1.references.forEach((ref) => {
                    if (ref.paperId === d2.paperId) {
                        citationLinkData.push({ source: i, target: j });
                    }
                });
                d1.recommends.forEach((rec) => {
                    if (rec === d2.paperId) {
                        recommendationLinkData.push({ source: i, target: j });
                    }
                });
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
                })
        )
        //Add an action that will undo the above when the pointer is moved away from the sphere mesh
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOutTrigger, () => {
                    //Same as above but in reverse
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
                            updatePaperPanelToNode(d, n);
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
                        // else if (pickDuration > CLICK_DELAY_THRESHOLD) {
                        //     // if long click, update paper panel
                        //     updatePaperPanelToNode(d,n);
                        // }
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
            setHoverPlaneToNode(null, null);

            // Release node from being fixed in place
            delete d.fx;
            delete d.fy;
            delete d.fz;

            // let the simulation relax
            // simulation.alpha(0.1);
        });
        n.addBehavior(dragBehavior);
    });

    // re-add highlight layer to selected nodes
    nodes.run((d, n, i) => {
        if (selectedIds.includes(d.paperId)) {
            highlighter.addMesh(n, Color3.White());
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

function createLinks(data) {
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
        .prop("color", new Color4(1, 1, 1, 0.3))
        //.prop("alpha", 0.3)
        .prop("isPickable", false);

    simulation.force("link", forceLink(data).distance(0.1).strength(2));
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
        const recommendedPapers = d.recommendedPapers.map((a) => a.paperId);
        const newPapers = await APIUtils.getDetailsForMultiplePapers(recommendedPapers);

        paperData.forEach((p) => {
            if (selectedIds.includes(p.paperId)) {
                recommendedPapers.forEach((rec) => {
                    if (!p.recommends.includes(rec)) {
                        p.recommends.push(rec);
                    }
                });
            }
        });

        selectedIds.length = 0;
        // recommendedPapers.forEach((p) => selectedIds.push(p));

        addPapersToGraph(newPapers);
    } catch (error) {
        console.error("addRecommendationsFromSelectedPapers() failed with error:", error);
    }
    waitingForAPI = false;

    nodes.run((d, n, i) => {
        if (recommendationSourceIds.includes(d.paperId)) {
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
        delete d.fx;
        delete d.fy;
        delete d.fz;
    });

    createNodes(paperData);
    createLinkData(paperData);

    createLinks(useCitationLinks ? citationLinkData : recommendationLinkData);

    nodes.run((d, n, i) => {
        if (newPaperIds.includes(d.paperId)) {
            highlighter.addMesh(n, Color3.FromHexString("#7CFC00"));
        }
    });

    setTimeout(() => {
        nodes.run((d, n, i) => {
            if (newPaperIds.includes(d.paperId)) {
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
    const newCitationLinkData = citationLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );
    const newRecommendationLinkData = recommendationLinkData.filter(
        (link) =>
            !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId)
    );

    paperData.length = 0;
    citationLinkData.length = 0;
    recommendationLinkData.length = 0;

    paperData.push(...newPaperData);
    citationLinkData.push(...newCitationLinkData);
    recommendationLinkData.push(...newRecommendationLinkData);

    // paperData = paperData.filter((p) => !idsToRemove.includes(p.paperId));
    // citationLinkData = citationLinkData.filter((link) => !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId));
    // recommendationLinkData = recommendationLinkData.filter((link) => !idsToRemove.includes(link.source.paperId) && !idsToRemove.includes(link.target.paperId));

    console.log("paperData", paperData);

    createNodes();
    createLinks(useCitationLinks ? citationLinkData : recommendationLinkData);
}

/**
 * Toggles between citation and recommendation links.
 */
export function toggleLinkType() {
    console.log("toggleLinkType() called");
    useCitationLinks = !useCitationLinks;
    createLinks(useCitationLinks ? citationLinkData : recommendationLinkData);
    // ticked();
}
