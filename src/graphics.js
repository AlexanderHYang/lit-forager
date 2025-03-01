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
    DebugLayer
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, StackPanel, ScrollViewer } from "@babylonjs/gui";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import "@babylonjs/loaders/glTF";
import * as anu from "@jpmorganchase/anu";
import { nodes, waitingForAPI } from "./graph";
import "@babylonjs/inspector";
import { timeout } from "d3";
// Create the Babylon.js engine and scene
const app = document.querySelector("#app");
const canvas = document.createElement("canvas");
app.appendChild(canvas);

export const engine = new Engine(canvas, true, { stencil: true });
export const scene = new Scene(engine);
scene.useRightHandedSystem = true;
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

export const env = scene.createDefaultEnvironment();

// Assuming 'env.ground' is your ground mesh
const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
groundMaterial.alpha = 0.0;
groundMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;

// Apply the material to the ground mesh
env.ground.material = groundMaterial;
env.ground.setAbsolutePosition(new BABYLON.Vector3(0, -1, 0));

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
    xr.baseExperience.camera.position.set(-0.5, 0.5, 0);
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

// Highlight Layer and hover plane
export const highlighter = new HighlightLayer("highlighter", scene);
scene.setRenderingAutoClearDepthStencil(1, false);
highlighter.blurHorizontalSize = 0.8;
highlighter.blurVerticalSize = 0.8;

export const hoverPlane = BABYLON.MeshBuilder.CreatePlane("hoverPlane", { width: 0.4, height: 0.4 }, scene);
let hoverPlaneId = null;
highlighter.addExcludedMesh(hoverPlane);

//Use the Babylon GUI system to create an AdvancedDynamicTexture that will the updated with our label content
const advancedTexture = AdvancedDynamicTexture.CreateForMesh(hoverPlane);

//Create a rectangle for the background
let UIBackground = new Rectangle();
UIBackground.adaptWidthToChildren = true;
UIBackground.adaptHeightToChildren = true;
UIBackground.cornerRadius = 20;
UIBackground.color = "Black";
UIBackground.thickness = 2;
UIBackground.background = "White";
advancedTexture.addControl(UIBackground);

//Create an empty text block
let label = new TextBlock();
label.paddingLeftInPixels = 25;
label.paddingRightInPixels = 25;
label.fontSizeInPixels = 50;
label.resizeToFit = true;
label.textWrapping = true;
label.text = " ";
UIBackground.addControl(label);

hoverPlane.isVisible = false; //Hide the plane until it is needed
// hoverPlane.billboardMode = 7; //Set billboard mode to always face camera
hoverPlane.isPickable = false; //Disable picking so it doesn't get in the way of interactions
hoverPlane.renderingGroupId = 2; //Set render id higher so it always renders in front

scene.onBeforeRenderObservable.add(() => {
    if (nodes) {
        nodes.run((d, n) => {
            if (d.paperId === hoverPlaneId) {
                hoverPlane.position = n.position.add(new Vector3(0, 0.08, 0)); // Add vertical offset
            }
        })
    }
    hoverPlane.lookAt(currCam.position);
});

export function updateHoverPlaneText(text) {
    label.text = text;
}
export function setHoverPlaneToNode(d, n) {
    if (n === null || d === null) {
        hoverPlane.isVisible = false;
        hoverPlaneId = null;
    } else {
        hoverPlaneId = d.paperId;
        label.text = d.title
        hoverPlane.position = n.position.add(new Vector3(0, 0.08, 0)); // Add vertical offset
        
        if (hoverPlaneId !== paperDetailsPanelId) {
            hoverPlane.isVisible = true;
        }
    }
}

// UI Manager and NearMenu
export const guiManager = new GUI.GUI3DManager(scene);
export const handMenu = new GUI.HandMenu(xr.baseExperience, "menu");

const handConstraintBehavior = handMenu.handConstraintBehavior;
handConstraintBehavior.gazeProximityRadius = 0.5;
handConstraintBehavior.palmUpStrictness = 0.9;
handConstraintBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
handConstraintBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
handConstraintBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
handConstraintBehavior.targetOffset = 0.15;
handMenu.columns = 2;

guiManager.addControl(handMenu);
handMenu.backPlateMargin = 0.1;
handMenu.scaling = new Vector3(0.06, 0.06, 0.06);
// nearMenu.defaultBehavior.followBehavior.minimumDistance = 0.3;
// nearMenu.defaultBehavior.followBehavior.maximumDistance = 0.5;
// Helper function to create UI buttons
const createButton = (name, text, onClick) => {
    const button = new GUI.TouchHolographicButton(name);
    button.text = text;
    button.onPointerClickObservable.add(onClick);
    return button;
};

// Exported UI buttons
export const recommendButton = createButton("recommend", "Recommend", () =>
    console.log("Recommend Clicked")
);
export const deleteButton = createButton("delete", "Delete", () => console.log("Delete Clicked"));
export const clearSelectionButton = createButton("clearSelection", "Clear Selection", () =>
    console.log("Clear Selection Clicked")
);
export const unpinNodesButton = createButton("unpinNodes", "Unpin Nodes", () =>
    console.log("Unpin Nodes Clicked")
);
export const toggleLinksButton = createButton("toggleLinks", "Toggle Links", () =>
    console.log("Toggle Links Clicked")
);

handMenu.addButton(recommendButton);
handMenu.addButton(deleteButton);
handMenu.addButton(clearSelectionButton);
handMenu.addButton(unpinNodesButton);
handMenu.addButton(toggleLinksButton);


// Make panel for paper details
// Create a floating plane for the paper details panel
export const paperDetailsPanel = MeshBuilder.CreatePlane("paperDetailsPanel", { width: 0.4, height: 0.8}, scene);
// paperDetailsPanel.position = new Vector3(0, 1, -2); // Adjust position in VR space
paperDetailsPanel.isVisible = false; // Initially hidden
paperDetailsPanel.adaptHeightToChildren = true;
// paperDetailsPanel.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
paperDetailsPanel.isPickable = false;
paperDetailsPanel.renderingGroupId = 2; // Ensure it renders in front
export let paperDetailsPanelId = null

highlighter.addExcludedMesh(paperDetailsPanel);

// Apply a transparent material
const panelMaterial = new StandardMaterial("panelMaterial", scene);
panelMaterial.diffuseColor = new Color3(1, 1, 1);
panelMaterial.alpha = 0; // Transparent background
paperDetailsPanel.material = panelMaterial;

// Create an AdvancedDynamicTexture for the panel
const panelTexture = AdvancedDynamicTexture.CreateForMesh(paperDetailsPanel,1024, 2048);

// Create a background rectangle
const panelBackground = new Rectangle("paperDatailPanelBackground");
// panelBackground.adaptWidthToChildren = true;
panelBackground.adaptHeightToChildren = true;
panelBackground.cornerRadius = 20;
panelBackground.color = "Black";
panelBackground.thickness = 2;
panelBackground.background = "White";
panelTexture.addControl(panelBackground);

// StackPanel to hold multiple text sections
const textPanel = new StackPanel("paperDetailStackPanel");
textPanel.isVertical = true;
textPanel.width = "90%"; // Ensure it fills the panel
textPanel.adaptHeightToChildren = true;
panelBackground.addControl(textPanel);

// Title Text Block
const titleBlock = new TextBlock("titleBlock");
titleBlock.text = "Paper Title";
titleBlock.color = "black";
titleBlock.fontSize = 60;
titleBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
// titleBlock.height = "100px";
titleBlock.textWrapping = true;
titleBlock.resizeToFit = true;
titleBlock.paddingTop = "20px"; // Add margin at the top
textPanel.addControl(titleBlock);

// Metadata Text Block
const metadataBlock = new TextBlock("metadataTextBlock");
metadataBlock.text = "Authors: John Doe, Jane Smith\nCitations: 1234\nReferences: 56";
metadataBlock.color = "black";
metadataBlock.fontSize = 30;
metadataBlock.textWrapping = true;
metadataBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
// metadataBlock.height = "120px";
metadataBlock.resizeToFit = true;
metadataBlock.paddingTop = "10px"; // Add spacing between sections
textPanel.addControl(metadataBlock);

// Abstract Title Block
const abstractTitleBlock = new TextBlock("abstractTitleTextBlock");
abstractTitleBlock.text = "Abstract";
abstractTitleBlock.color = "black";
abstractTitleBlock.fontSize = 40;
abstractTitleBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
// abstractTitleBlock.height = "80px";
abstractTitleBlock.textWrapping = true;
abstractTitleBlock.resizeToFit = true;
abstractTitleBlock.paddingTop = "15px"; // Space before the abstract title
textPanel.addControl(abstractTitleBlock);

// Abstract Text Block
const abstractBlock = new TextBlock("abstractTextBlock");
abstractBlock.text = "This is the abstract content explaining the research...";
abstractBlock.color = "black";
abstractBlock.fontSize = 30;
abstractBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
// abstractBlock.height = "200px";
abstractBlock.textWrapping = true;
abstractBlock.resizeToFit = true;
abstractBlock.paddingTop = "10px"; // Space before abstract content
abstractBlock.paddingBottom = "20px"; // Space at bottom of panel
textPanel.addControl(abstractBlock);

scene.onBeforeRenderObservable.add(() => {
    if (nodes) {
        nodes.run((d, n) => {
            if (d.paperId === paperDetailsPanelId) {
                const cameraRight = BABYLON.Vector3.Cross(currCam.getForwardRay().direction, BABYLON.Vector3.Up()).normalize();
                const offset = cameraRight.scale(0.25);
                paperDetailsPanel.position = n.position.add(offset);
            }
        })
    }
    paperDetailsPanel.lookAt(currCam.position);
});

// Function to update paper details
export function updatePaperPanelToNode(d,n) {
    if (paperDetailsPanelId !== null) {
        nodes.run((d, n) => {
            if (d.paperId === paperDetailsPanelId) {
                highlighter.removeMesh(n);
            }
        });
    }

    if (d === null || n === null) {
        paperDetailsPanel.isVisible = false;
        paperDetailsPanelId = null;
    } else {

        if (paperDetailsPanelId === d.paperId) {
            updatePaperPanelToNode(null, null); // Hide panel if it's already visible
            highlighter.removeMesh(n);
            setHoverPlaneToNode(d, n); // Show hover plane instead
            return;
        }

        setHoverPlaneToNode(null, null); // Hide hover plane if it's visible

        paperDetailsPanelId = d.paperId;
        const metadata = `${d.authors.map(a => a.name).join(", ")}\nCitations: ${d.citationCount}\nReferences: ${d.referenceCount}`;
        const abstractText = d.abstract;

        titleBlock.text = d.title;
        metadataBlock.text = metadata;
        abstractBlock.text = abstractText;

        paperDetailsPanel.isVisible = true;
        highlighter.addMesh(n, Color3.Blue());
        scene.setRenderingAutoClearDepthStencil(1, false, false);
    }
}


// emulating full screen ui
const fullscreenUIPlane = MeshBuilder.CreatePlane("fullscreenUIPlane", { width: 0.4, height: 0.4 }, scene);
const fullscreenUITexture = AdvancedDynamicTexture.CreateForMesh(fullscreenUIPlane);
const fullScreenUIBackground = new Rectangle();
const fullscreenUITextBlock = new TextBlock();

fullscreenUITexture.addControl(fullScreenUIBackground);
fullScreenUIBackground.addControl(fullscreenUITextBlock);

fullScreenUIBackground.thickness = 0;
fullscreenUITextBlock.text = "Full Screen UI";
fullscreenUITextBlock.color = "black";
fullscreenUITextBlock.fontSize = 50;

fullscreenUIPlane.isVisible = false;

scene.onBeforeRenderObservable.add(() => {
    if (fullscreenUIPlane.isVisible) {
        fullscreenUIPlane.position = currCam.getFrontPosition(1.5);
        fullscreenUIPlane.lookAt(currCam.position);
    }
});

let timeoutTime = null;
export function setFullScreenUIText(text) {
    console.log(text);
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
