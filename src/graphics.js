import {
    Scene,
    HemisphericLight,
    ArcRotateCamera,
    Vector3,
    Color3,
    Engine,
    StandardMaterial,
    HighlightLayer,
    MeshBuilder,
    DebugLayer,
} from "@babylonjs/core";
import { GridMaterial, GradientMaterial } from "@babylonjs/materials";
import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    StackPanel,
    ScrollViewer,
} from "@babylonjs/gui";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import "@babylonjs/loaders/glTF";
import * as anu from "@jpmorganchase/anu";
import {
    nodes,
    selectedIds,
    waitingForAPI,
    addRecommendationsFromSelectedPapers,
    removeSelectedNodesFromGraph,
    clearNodeSelection,
    unpinNodes,
    changeLinkType,
    addCitationsFromSelectedPaper,
    addReferencesFromSelectedPaper,
    addPapersFromAuthor,
    restoreDeletedPapers,
    paperSummaryMap,
    paperKeywordsMap,
    paperAnnotationsMap,
    connectSelectedNodes,
    testCreateClusters,
    sendCurrentlyViewingNodeData,
    clearAnnotationsForPaper,
} from "./graph";
import "@babylonjs/inspector";
import { timeout } from "d3";
import { removeItem } from "./utils";
import { socket } from "./socket-connection";
import { logEvent } from "../main";
// import { log } from "console";
// Create the Babylon.js engine and scene
const app = document.querySelector("#app");
const canvas = document.createElement("canvas");
app.appendChild(canvas);

export const engine = new Engine(canvas, true, { stencil: true });
export const scene = new Scene(engine);
Scene.DoubleClickDelay = 500;
export const camera = new ArcRotateCamera(
    "Camera",
    -(Math.PI / 4) * 3,
    Math.PI / 4,
    10,
    new Vector3(0, 0, 0),
    scene
);
export const light = new HemisphericLight("light1", new Vector3(0, 10, 0), scene);

camera.position.set(-0.5, 0, 0);
camera.setTarget(new BABYLON.Vector3(0, 0, 0));

camera.wheelPrecision = 20;
camera.minZ = 0;
camera.attachControl(canvas, true);
camera.position = new Vector3(0, 0, -1.5);

light.diffuse = new Color3(1, 1, 1);
light.specular = new Color3(1, 1, 1);
light.groundColor = new Color3(1, 1, 1);

// Create the CoT and get the hover plane
export const CoT_babylon = anu.create("cot", "cot");
export const CoT = anu.selectName("cot", scene);

// export const env = scene.createDefaultEnvironment();
export const env = scene.createDefaultEnvironment({
    createGround: true,
    createSkybox: false,
});

// Assuming 'env.ground' is your ground mesh
const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
groundMaterial.alpha = 0.0;
groundMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;

// Apply the material to the ground mesh
env.ground.material = groundMaterial;
env.ground.setAbsolutePosition(new BABYLON.Vector3(0, -1, 0));

// Import the .env file as a CubeTexture
const texture = new BABYLON.CubeTexture("./src/skybox.env", scene);
// Create a skybox mesh using this texture
const skybox = scene.createDefaultSkybox(texture, true, 10000, 0.1);
const skyboxBrightness = 0.5; // Adjust this value to make the skybox dimmer

// Apply the dimmer color to the skybox
if (skybox && skybox.material) {
    skybox.material.reflectionTexture.level = skyboxBrightness
    skybox.material.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
}

// Create a visible ground mesh
const groundSize = 1000;
const ground = BABYLON.MeshBuilder.CreateGround(
    "visibleGround",
    {
        width: groundSize,
        height: groundSize,
        subdivisions: 2,
    },
    scene
);
ground.position.y = -1;

// Then replace your visibleGroundMaterial with this
const visibleGroundMaterial = new GridMaterial("groundMaterial", scene);
visibleGroundMaterial.majorUnitFrequency = 10; // A major line every 10 units
visibleGroundMaterial.minorUnitVisibility = 0.45; // Minor grid lines visibility
visibleGroundMaterial.gridRatio = 1; // Grid cell size
visibleGroundMaterial.backFaceCulling = false;
visibleGroundMaterial.mainColor = (new BABYLON.Color3(1, 1, 1)).scale(0.8); // White
visibleGroundMaterial.lineColor = (new BABYLON.Color3(0.8, 0.8, 0.9)).scale(0.8); // Light blue-gray lines
visibleGroundMaterial.opacity = 0.99; // Almost fully opaque

// Create a solid ground material for comparison
const solidGroundMaterial = new BABYLON.StandardMaterial("solidGroundMaterial", scene);
solidGroundMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 1.0); // Dark blue-gray color
solidGroundMaterial.alpha = 0.1
solidGroundMaterial.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9); // Low specular reflection

// Create a second ground mesh that can be toggled with the grid ground
const solidGround = BABYLON.MeshBuilder.CreateGround("solidGround", {
    width: groundSize, 
    height: groundSize,
    subdivisions: 2
}, scene);
solidGround.position.y = -1.01; // Slightly below the grid to prevent z-fighting
solidGround.material = solidGroundMaterial;
solidGround.isVisible = false; // Start with grid visible by default

// Add a key handler to toggle between grid and solid ground
scene.onKeyboardObservable.add((kbInfo) => {
    if(kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN && kbInfo.event.key === 'g') {
        ground.isVisible = !ground.isVisible;
        solidGround.isVisible = !solidGround.isVisible;
    }
});

solidGround.isVisible = true;
ground.isVisible = false;

// No need for the gradient texture now
// Apply material directly to ground
ground.material = visibleGroundMaterial;

// Enable XR
export const xr = await scene.createDefaultXRExperienceAsync({
    floorMeshes: [env.ground],
    optionalFeatures: true,
});
let currentlyInXr = false;

const xrFeatureManager = xr.baseExperience.featuresManager;
xrFeatureManager.disableFeature(BABYLON.WebXRFeatureName.POINTER_SELECTION);
xrFeatureManager.disableFeature(BABYLON.WebXRFeatureName.TELEPORTATION);

const xrSessionManager = xr.baseExperience.sessionManager;
let currCam = camera;

xrSessionManager.onXRFrameObservable.addOnce(() => {
    xr.baseExperience.camera.position.set(-0.5, 0, 0);
    xr.baseExperience.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
});
xrSessionManager.onXRSessionInit.add(() => {
    currentlyInXr = true;
    currCam = xr.baseExperience.camera;
    console.log("XR Session Initialized");
});
xrSessionManager.onXRSessionEnded.add(() => {
    currentlyInXr = false;
    currCam = camera;
    console.log("XR Session Ended");
});

const xrHandFeature = xrFeatureManager.enableFeature(
    BABYLON.WebXRFeatureName.HAND_TRACKING,
    "latest",
    {
        xrInput: xr.input,
    }
);

let clusterStartTime = null;
let clusterTriggered = false;

xrHandFeature.onHandAddedObservable.add(() => {
    scene.onBeforeRenderObservable.add(() => {
        const now = performance.now();
        const leftHand = xrHandFeature.getHandByHandedness("left");
        const rightHand = xrHandFeature.getHandByHandedness("right");

        if (leftHand && rightHand) {
            const joints = [
                BABYLON.WebXRHandJoint.THUMB_TIP,
                BABYLON.WebXRHandJoint.INDEX_FINGER_TIP,
                BABYLON.WebXRHandJoint.MIDDLE_FINGER_TIP,
                BABYLON.WebXRHandJoint.RING_FINGER_TIP,
                BABYLON.WebXRHandJoint.PINKY_FINGER_TIP,
            ];
            let allFingersClose = true;

            for (const jointName of joints) {
                const leftTip = leftHand.getJointMesh(jointName);
                const rightTip = rightHand.getJointMesh(jointName);
                if (leftTip && rightTip) {
                    const distance = BABYLON.Vector3.Distance(leftTip.position, rightTip.position);
                    if (distance >= 0.05) {
                        allFingersClose = false;
                        break;
                    }
                }
            }

            if (allFingersClose) {
                if (!clusterTriggered) {
                    if (clusterStartTime === null) {
                        clusterStartTime = now;
                    } else if (now - clusterStartTime >= 1000) {
                        logEvent("Cluster hand gesture triggered", {});
                        console.log("Cluster event has been triggered");
                        clusterTriggered = true;
                        logEvent("socket - emit CreateClustersButtonPressed", {});
                        socket.emit("createClustersButtonPressed", {});
                    }
                }
            } else {
                // Reset once fingers are apart (allowing a new trigger when closed again)
                clusterStartTime = null;
                clusterTriggered = false;
            }
        } else {
            // Reset if one of the hands is not available
            clusterStartTime = null;
            clusterTriggered = false;
        }
    });
});

// Highlight Layer and hover plane
export const highlighter = new HighlightLayer("highlighter", scene);
scene.setRenderingAutoClearDepthStencil(2, false);
scene.setRenderingAutoClearDepthStencil(3, false);
scene.setRenderingAutoClearDepthStencil(1, false);
highlighter.blurHorizontalSize = 0.8;
highlighter.blurVerticalSize = 0.8;

export const hoverPlane = BABYLON.MeshBuilder.CreatePlane(
    "hoverPlane",
    { width: 0.4, height: 0.4 },
    scene
);
let hoverPlaneId = null;
highlighter.addExcludedMesh(hoverPlane);

// 0AQMY9
const hoverPlaneTexture = AdvancedDynamicTexture.CreateForMesh(hoverPlane);
const hoverPlaneGUI = await hoverPlaneTexture.parseFromSnippetAsync("0AQMY9");

const titlePanelBackground = hoverPlaneTexture.getControlByName("titlePanelBackground");
const titleStackPanel = titlePanelBackground.getChildByName("titleStackPanel");
const titleTextBlock = titleStackPanel.getChildByName("titleTextBlock");

const clusterPanelBackground = hoverPlaneTexture.getControlByName("clusterPanelBackground");
const clusterStackPanel = clusterPanelBackground.getChildByName("clusterStackPanel");
const clusterTextBlock = clusterStackPanel.getChildByName("clusterTextBlock");

clusterPanelBackground.isVisible = false;
hoverPlane.isVisible = false;
hoverPlane.isPickable = false;
hoverPlane.renderingGroupId = 2;

titleTextBlock.paddingLeftInPixels = 25;
titleTextBlock.paddingRightInPixels = 25;

clusterTextBlock.paddingLeftInPixels = 25;
clusterTextBlock.paddingRightInPixels = 25;

scene.onBeforeRenderObservable.add(() => {
    if (nodes) {
        nodes.run((d, n) => {
            if (d.paperId === hoverPlaneId) {
                hoverPlane.position = n.position.add(new Vector3(0, 0.08, 0)); // Add vertical offset
            }
        });
    }
    const reversePos = hoverPlane.position.add(hoverPlane.position.subtract(currCam.position));
    hoverPlane.lookAt(reversePos);
    // hoverPlane.lookAt(currCam.position);
});

export function updateHoverPlaneText(text) {
    // label.text = text;
    titleTextBlock.text = text;
}
export function setHoverPlaneToNode(d, n) {
    logEvent("setHoverPlaneToNode() called", {
        hoverPlaneId: hoverPlaneId,
        paperDetailsPanelId: paperDetailsPanelId,
        hoverPlaneVisibility: hoverPlane.isVisible,
        nodeData: d,
    });
    if (n === null || d === null) {
        logEvent("setHoverPlaneToNode() - hiding hover plane", {});
        hoverPlane.isVisible = false;
        hoverPlaneId = null;
    } else {
        hoverPlaneId = d.paperId;

        // label.text = d.title;
        titleTextBlock.text = d.title;
        if (d.clusterName) {
            // clusterLabel.text = `Cluster: ${d.clusterName}`;
            // clusterLabel.isVisible = true;
            clusterTextBlock.text = `Cluster: ${d.clusterName}`;
            clusterPanelBackground.isVisible = true;
        } else {
            // clusterLabel.isVisible = false;
            clusterPanelBackground.isVisible = false;
        }

        hoverPlane.position = n.position.add(new Vector3(0, 0.08, 0)); // Add vertical offset

        if (hoverPlaneId !== paperDetailsPanelId) {
            hoverPlane.isVisible = true;
        }
    }

    logEvent("setHoverPlaneToNode() finished", {
        hoverPlaneId: hoverPlaneId,
        paperDetailsPanelId: paperDetailsPanelId,
        hoverPlaneVisibility: hoverPlane.isVisible,
    });
}

// UI Manager and NearMenu
export const guiManager = new GUI.GUI3DManager(scene);
export const handMenu = new GUI.HandMenu(xr.baseExperience, "menu");

function hideMenu(menu) {
    // logEvent("hideMenu", {menuName: menu.name});
    menu.scaling = new Vector3(0, 0, 0);
    menu.isPickable = false;
}
function showMenu(menu) {
    // logEvent("showMenu", {menuName: menu.name});
    menu.scaling = new Vector3(0.06, 0.06, 0.06);
    menu.isPickable = true;
}

const handConstraintBehavior = handMenu.handConstraintBehavior;
handConstraintBehavior.palmUpStrictness = 0.8;
handConstraintBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
handConstraintBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
handConstraintBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
handConstraintBehavior.targetOffset = 0.15;
handConstraintBehavior.handedness = "left";
handMenu.columns = 2;

guiManager.addControl(handMenu);
handMenu.backPlateMargin = 0.1;
handMenu.scaling = new Vector3(0.06, 0.06, 0.06);

// Helper function to create UI buttons
const createButton = (name, text, shareMaterial = true) => {
    const button = new GUI.TouchHolographicButton(name, shareMaterial);
    button.wrap;
    button.text = text;
    guiManager.addControl(button);
    return button;
};

// Exported UI buttons
export const recommendButton = createButton("recommend", "Recommend Papers");
export const deleteButton = createButton("delete", "Delete Papers");
export const clearSelectionButton = createButton("clearSelection", "Clear Selection");
export const unpinNodesButton = createButton("unpinNodes", "Unpin Papers");
export const toggleLinksButton = createButton("toggleLinks", "Change Link Type");
export const createClustersButton = createButton("createClusters", "Cluster Papers");
export const summarizeButton = createButton("summarizeButton", "Summarize Paper");
export const keywordsButton = createButton("keywordsButton", "Generate Keywords");

export const annotateButton = createButton("annotateButton", "Start Annotation", false);
annotateButton.isToggleButton = true;
export const clearAnnotationButton = createButton("clearAnnotationButton", "Clear Annotation");

// Attach UI button behaviors
recommendButton.onPointerClickObservable.add(() => {
    logEvent("recommendButtonPressed", {});
    console.log("Recommend button pressed");
    hideMenu(handMenu);
    showMenu(recommendationsMenu);
});

deleteButton.onPointerClickObservable.add(() => {
    logEvent("deleteButtonPressed", {});
    console.log("Delete button pressed");
    removeSelectedNodesFromGraph();
});
clearSelectionButton.onPointerClickObservable.add(() => {
    logEvent("clearSelectionButtonPressed", {});
    console.log("Clear Selection button pressed");
    clearNodeSelection();
});
unpinNodesButton.onPointerClickObservable.add(() => {
    logEvent("unpinNodesButtonPressed", {});
    console.log("Unpin Nodes button pressed");
    unpinNodes();
});
toggleLinksButton.onPointerClickObservable.add(() => {
    logEvent("toggleLinksButtonPressed", {});
    console.log("Toggle Links button pressed");
    changeLinkType();
});
createClustersButton.onPointerClickObservable.add(() => {
    logEvent("createClustersButtonPressed", {});
    console.log("Create Cluster button pressed");
    socket.emit("createClustersButtonPressed", {});
});
summarizeButton.onPointerClickObservable.add(() => {
    logEvent("summarizeButtonPressed", {});
    console.log("Summarize Button pressed");
    socket.emit("summarizeButtonPressed", {});
});
keywordsButton.onPointerClickObservable.add(() => {
    logEvent("keywordsButtonPressed", {});
    console.log("Keywords Button pressed");
    socket.emit("keywordsButtonPressed", {});
});

annotateButton.onToggleObservable.add(() => {
    logEvent("annotateButtonPressed", { isToggled: annotateButton.isToggled });
    // Set alpha mode regardless of toggle state

    if (annotateButton.isToggled) {
        console.log("Annotate Button toggled on");
        annotateButton.plateMaterial.alphaMode = BABYLON.Engine.ALPHA_ONEONE;
        annotateButton.plateMaterial.diffuseColor = new BABYLON.Color3(0, 255, 255);
        annotateButton.text = "Stop Annotation";
        socket.emit("annotateButtonPressed", {});
    } else {
        console.log("Annotate Button toggled off");
        annotateButton.plateMaterial.alphaMode = 2;
        annotateButton.plateMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
        annotateButton.text = "Start Annotation";
        socket.emit("annotateButtonReleased", {});
    }
});

clearAnnotationButton.onPointerClickObservable.add(() => {
    logEvent("clearAnnotationButtonPressed", {});
    console.log("Clear Annotation Button pressed");
    clearAnnotationsForPaper(paperDetailsPanelId);
});
handMenu.addButton(annotateButton);
handMenu.addButton(clearAnnotationButton);
handMenu.addButton(deleteButton);
handMenu.addButton(unpinNodesButton);
handMenu.addButton(toggleLinksButton);
handMenu.addButton(createClustersButton);
handMenu.addButton(summarizeButton);
handMenu.addButton(keywordsButton);
handMenu.addButton(clearSelectionButton);
handMenu.addButton(recommendButton);

// add extra hand menus
const recommendationsMenu = new GUI.HandMenu(xr.baseExperience, "recommendationsMenu");

const recommendationsMenuBehavior = recommendationsMenu.handConstraintBehavior;
recommendationsMenuBehavior.palmUpStrictness = 0.9;
recommendationsMenuBehavior.handConstraintVisibility =
    BABYLON.HandConstraintVisibility.PALM_AND_GAZE;
recommendationsMenuBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
recommendationsMenuBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
recommendationsMenuBehavior.targetOffset = 0.15;
recommendationsMenu.columns = 2;

guiManager.addControl(recommendationsMenu);
recommendationsMenu.backPlateMargin = 0.1;
recommendationsMenu.scaling = new Vector3(0.06, 0.06, 0.06);

const recByThematicButton = createButton("recByThematic", "By Thematic Similarity");
const recByCitationButton = createButton("recByCitation", "By Citation");
const recByReferenceButton = createButton("recByReference", "By Reference");
const recByAuthorButton = createButton("recByAuthor", "By Authors");
const recBackButton = createButton("recBack", "Back");

recommendationsMenu.addButton(recBackButton);
recommendationsMenu.addButton(recByAuthorButton);
recommendationsMenu.addButton(recByReferenceButton);
recommendationsMenu.addButton(recByCitationButton);
recommendationsMenu.addButton(recByThematicButton);

recByThematicButton.onPointerClickObservable.add(() => {
    logEvent("recByThematicButtonPressed", { selectedIds: selectedIds });
    console.log("Recommend by thematic button pressed");
    addRecommendationsFromSelectedPapers();
});
recByCitationButton.onPointerClickObservable.add(() => {
    logEvent("recByCitationButtonPressed", { selectedIds: selectedIds });
    console.log("Recommend by citation button pressed");
    addCitationsFromSelectedPaper();
});
recByReferenceButton.onPointerClickObservable.add(() => {
    logEvent("recByReferenceButtonPressed", { selectedIds: selectedIds });
    console.log("Recommend by reference button pressed");
    addReferencesFromSelectedPaper();
});
recByAuthorButton.onPointerClickObservable.add(() => {
    logEvent("recByAuthorButtonPressed", {});
    console.log("Recommend by author button pressed");
    // addPapersFromAuthor();
    generateAuthorButtons();
    hideMenu(recommendationsMenu);
    showMenu(authorMenu);
});
recBackButton.onPointerClickObservable.add(() => {
    logEvent("recBackButtonPressed", {});
    console.log("Recommend back button pressed");
    hideMenu(recommendationsMenu);
    showMenu(handMenu);
});

hideMenu(recommendationsMenu);

let lastSelectedCount = 0;
scene.onBeforeRenderObservable.add(() => {
    if (selectedIds.length !== lastSelectedCount) {
        lastSelectedCount = selectedIds.length;

        // recommendationsMenu buttons
        if (selectedIds.length === 0) {
            recByThematicButton.isVisible = false;
            recByCitationButton.isVisible = false;
            recByReferenceButton.isVisible = false;
            recByAuthorButton.isVisible = false;
        } else if (selectedIds.length === 1) {
            recByAuthorButton.isVisible = true;
            recByCitationButton.isVisible = true;
            recByReferenceButton.isVisible = true;
            recByThematicButton.isVisible = true;
        } else {
            recByAuthorButton.isVisible = false;
            recByCitationButton.isVisible = false;
            recByReferenceButton.isVisible = false;
            recByThematicButton.isVisible = true;
        }

        // authorMenu buttons
        if (selectedIds.length !== 1 && authorMenu.isPickable) {
            hideMenu(authorMenu);
            showMenu(recommendationsMenu);
        }
    }
});

const authorButtons = [];
const authorMenu = new GUI.HandMenu(xr.baseExperience, "authorMenu");

const authorMenuBehavior = authorMenu.handConstraintBehavior;
authorMenuBehavior.palmUpStrictness = 0.8;
authorMenuBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
authorMenuBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
authorMenuBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
authorMenuBehavior.targetOffset = 0.15;
authorMenu.columns = 2;

guiManager.addControl(authorMenu);
authorMenu.backPlateMargin = 0.1;
authorMenu.scaling = new Vector3(0.06, 0.06, 0.06);

function generateAuthorButtons() {
    logEvent("generateAuthorButtons()", { selectedIds: selectedIds });
    if (selectedIds.length !== 1) {
        console.error("Error: Must have exactly one selected node to generate author buttons");
        return;
    }

    authorButtons.length = 0;
    let authorData = null;
    nodes.run((d, n) => {
        if (d.paperId === selectedIds[0]) {
            authorData = d.authors;
        }
    });

    if (authorData === null) {
        logEvent("generateAuthorButtons() - no author data found", {});
        console.error("Error: Could not find author data for selected node");
        return;
    }
    authorData = authorData.slice(0, 10);
    authorData.forEach((author) => {
        const authorButton = createButton(`author_${author.authorId}`, author.name);
        authorButton.onPointerClickObservable.add(() => {
            console.log(`Author button for ${author.name} pressed`);
            addPapersFromAuthor(author.authorId);
        });
        authorButtons.push(authorButton);
        authorMenu.addButton(authorButton);
    });

    const authorBackButton = createButton("authorBack", "Back");
    authorBackButton.onPointerClickObservable.add(() => {
        console.log("Author back button pressed");
        hideMenu(authorMenu);
        showMenu(recommendationsMenu);
    });
    authorMenu.addButton(authorBackButton);

    logEvent("generateAuthorButtons() finished", { authors: authorData });
}

hideMenu(authorMenu);

// Make panel for paper details
// Create a floating plane for the paper details panel
export const paperDetailsPanel = MeshBuilder.CreatePlane(
    "paperDetailsPanel",
    { width: 0.4, height: 1.2 },
    scene
);
// paperDetailsPanel.position = new Vector3(0, 1, -2); // Adjust position in VR space
paperDetailsPanel.isVisible = false; // Initially hidden
paperDetailsPanel.adaptHeightToChildren = true;
// paperDetailsPanel.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
paperDetailsPanel.isPickable = false;
paperDetailsPanel.renderingGroupId = 2; // Ensure it renders in front
export let paperDetailsPanelId = null;

highlighter.addExcludedMesh(paperDetailsPanel);

// Apply a transparent material
const panelMaterial = new StandardMaterial("panelMaterial", scene);
panelMaterial.diffuseColor = new Color3(1, 1, 1);
panelMaterial.alpha = 0; // Transparent background
paperDetailsPanel.material = panelMaterial;

// Create an AdvancedDynamicTexture for the panel
const panelTexture = AdvancedDynamicTexture.CreateForMesh(paperDetailsPanel, 1024, 3072);
let loadedGUI = await panelTexture.parseFromSnippetAsync("#R4A2E9#21");

let paperDetailPanelBackground = panelTexture.getControlByName("paperDetailPanelBackground");
let paperDetailStackPanel = paperDetailPanelBackground.getChildByName("paperDetailStackPanel");
let titleBlock = paperDetailStackPanel.getChildByName("titleBlock");
let authorBlock = paperDetailStackPanel.getChildByName("authorBlock");
let metadataTextBlock = paperDetailStackPanel.getChildByName("metadataTextBlock");

let abstractPanelBackground = panelTexture.getControlByName("abstractPanelBackground");
let abstractPanelStackPanel = abstractPanelBackground.getChildByName("abstractPanelStackPanel");
let abstractTextBlock = abstractPanelStackPanel.getChildByName("abstractTextBlock");
let insightsTextBlock = abstractPanelStackPanel.getChildByName("insightsTextBlock");

let notesPanelBackground = panelTexture.getControlByName("notesPanelBackground");
let notesPanelStackPanel = notesPanelBackground.getChildByName("notesPanelStackPanel");
let notesTextBlock = notesPanelStackPanel.getChildByName("notesTextBlock");

scene.onBeforeRenderObservable.add(() => {
    if (nodes) {
        nodes.run((d, n) => {
            if (d.paperId === paperDetailsPanelId) {
                const cameraRight = BABYLON.Vector3.Cross(
                    n.position.subtract(currCam.position),
                    BABYLON.Vector3.Up()
                ).normalize();
                const offset = cameraRight.scale(0.25);
                paperDetailsPanel.position = n.position.add(offset);
            }
        });
    }
    // paperDetailsPanel.lookAt(currCam.position);
    const reversePos = paperDetailsPanel.position.add(
        paperDetailsPanel.position.subtract(currCam.position)
    );
    paperDetailsPanel.lookAt(reversePos);
});

// Function to update paper details
export function updatePaperPanelToNode(d, n) {
    logEvent("updatePaperPanelToNode()", {
        paperDetailsPanelId: paperDetailsPanelId,
        paperDetailsPanelVisibility: paperDetailsPanel.isVisible,
        nodeData: d,
    });
    // remove old highlight, add node to selectedIds
    if (paperDetailsPanelId !== null) {
        nodes.run((d, n) => {
            if (d.paperId === paperDetailsPanelId) {
                highlighter.removeMesh(n);
            }
        });
    }

    if (d === null || n === null) {
        // if setting to null
        // remove highlight from prev blue node
        nodes.run((d1, n1) => {
            if (d1.paperId === paperDetailsPanelId) {
                highlighter.removeMesh(n1);
            }
        });
        // remove previous blue node from selectedIds
        removeItem(selectedIds, paperDetailsPanelId);
        // hide panel
        paperDetailsPanel.isVisible = false;
        paperDetailsPanelId = null;
    } else {
        // if setting to a new node

        // if setting to current node, then treat as if unselecting
        if (paperDetailsPanelId === d.paperId) {
            updatePaperPanelToNode(null, null); // Hide panel if it's already visible
            setHoverPlaneToNode(d, n); // Show hover plane instead
            return;
        }

        setHoverPlaneToNode(null, null); // Hide hover plane if it's visible

        // remove previous selection before adding new selection
        updatePaperPanelToNode(null, null);

        // make sure node is selected
        if (!selectedIds.includes(d.paperId)) {
            selectedIds.push(d.paperId);
        }

        console.log(d);
        paperDetailsPanelId = d.paperId;

        // Modifying the UI elements for each paper
        titleBlock.text = d.title ? d.title : "No title available";
        authorBlock.text =
            d.authors.length > 10
                ? `${d.authors
                      .slice(0, 10)
                      .map((a) => a.name)
                      .join(", ")} ...`
                : `${d.authors.map((a) => a.name).join(", ")}`;

        const metadata = `Citation count: ${d.citationCount}\nYear: ${d.year}\nVenue: ${d.venue}`;
        metadataTextBlock.text = metadata;

        // Limit the abstract to 2000 characters
        let abstractText = d.abstract ? d.abstract : "No abstract available";
        if (abstractText?.length > 1800) {
            let limited = abstractText.substring(0, 1800);
            // Cut off at the last space to avoid breaking words
            const lastSpace = limited.lastIndexOf(" ");
            abstractText =
                (lastSpace > 0 ? abstractText.substring(0, lastSpace) : limited) + " ...";
        }
        if (abstractText != null) {
            abstractTextBlock.text = abstractText;
        }

        updateInsightsAndNotesText(d.paperId);

        paperDetailsPanel.isVisible = true;
        highlighter.addMesh(n, Color3.Blue());
        sendCurrentlyViewingNodeData();
    }

    logEvent("updatePaperPanelToNode() finished", {
        paperDetailsPanelId: paperDetailsPanelId,
        paperDetailsPanelVisibility: paperDetailsPanel.isVisible,
    });
}

// New function to update the insights text based on a given node
export function updateInsightsAndNotesText(paperId, cleared) {
    logEvent("updateInsightsAndNotesText()", { paperId: paperId });
    const insights = paperSummaryMap[paperId];
    const keywords = paperKeywordsMap[paperId];
    const annotations = paperAnnotationsMap[paperId];
    let content = "";

    if (insights && insights.trim() !== "") {
        content += insights;
    }
    if (keywords && keywords.trim() !== "") {
        if (content !== "") {
            content += "\n";
        }
        content += keywords;
    }

    if (content === "") {
        insightsTextBlock.text = "";
        insightsTextBlock.isVisible = false;
    } else {
        insightsTextBlock.text = content;
        insightsTextBlock.isVisible = true;
    }

    if (annotations && annotations.trim() !== "") {
        notesTextBlock.text = annotations;
        notesPanelBackground.isVisible = true;
    } else {
        notesTextBlock.text = "";
        notesPanelBackground.isVisible = false;
    }
    if (cleared) {
        notesTextBlock.text = "";
        notesPanelBackground.isVisible = false;
    }

    logEvent("updateInsightsAndNotesText() finished", {
        paperId: paperId,
        insights: insights,
        keywords: keywords,
        annotations: annotations,
    });
}

// emulating full screen ui
const fullscreenUIPlane = MeshBuilder.CreatePlane(
    "fullscreenUIPlane",
    { width: 0.4, height: 0.4 },
    scene
);
const fullscreenUITexture = AdvancedDynamicTexture.CreateForMesh(fullscreenUIPlane);
const fullScreenUIBackground = new Rectangle();
const fullscreenUITextBlock = new TextBlock();

fullscreenUITexture.addControl(fullScreenUIBackground);
fullScreenUIBackground.addControl(fullscreenUITextBlock);

fullScreenUIBackground.thickness = 0;
fullscreenUITextBlock.text = "Full Screen UI";
fullscreenUITextBlock.color = "black";
fullscreenUITextBlock.fontSize = 30;
fullscreenUITextBlock.outlineWidth = 10; // Adjust thickness of the outline
fullscreenUITextBlock.outlineColor = "white"; // Set outline color to white

fullscreenUIPlane.isVisible = false;
fullscreenUIPlane.isPickable = false;
fullscreenUIPlane.renderingGroupId = 3;

scene.onBeforeRenderObservable.add(() => {
    if (fullscreenUIPlane.isVisible) {
        fullscreenUIPlane.position = currCam.getFrontPosition(0.75);
        fullscreenUIPlane.lookAt(currCam.position);
        fullscreenUIPlane.rotate(new Vector3(0, 1, 0), Math.PI);
    }
});

let timeoutTime = null;
export function setFullScreenUIText(text) {
    logEvent("setFullScreenUIText()", { text: text });
    fullscreenUIPlane.isVisible = true;
    fullscreenUITextBlock.text = text;
    timeoutTime = performance.now() + 2900;
    setTimeout(() => {
        if (performance.now() > timeoutTime) {
            fullscreenUIPlane.isVisible = false;
        }
    }, 3000);
}

// Start render loop
engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});
