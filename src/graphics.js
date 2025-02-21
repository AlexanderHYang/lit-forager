import {
    Scene,
    HemisphericLight,
    ArcRotateCamera,
    Vector3,
    Color3,
    Engine,
    StandardMaterial,
    HighlightLayer,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import "@babylonjs/loaders/glTF";
import * as anu from "@jpmorganchase/anu";

// Create the Babylon.js engine and scene
const app = document.querySelector("#app");
const canvas = document.createElement("canvas");
app.appendChild(canvas);

export const engine = new Engine(canvas, true, { stencil: true });
export const scene = new Scene(engine);
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

const xrFeatureManager = xr.baseExperience.featuresManager;
xrFeatureManager.disableFeature(BABYLON.WebXRFeatureName.POINTER_SELECTION);
xrFeatureManager.disableFeature(BABYLON.WebXRFeatureName.TELEPORTATION);

const xrSessionManager = xr.baseExperience.sessionManager;

xrSessionManager.onXRFrameObservable.addOnce(() => {
    xr.baseExperience.camera.position.set(-0.5, 0, 0);
    xr.baseExperience.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
});

// Highlight Layer and hover plane
export const highlighter = new HighlightLayer("highlighter", scene);
export let hoverPlane = null;
CoT.bind("plane", { width: 0.6, height: 0.6 }, [{}]).run((d, n) => {
    hoverPlane = n; // Get the first created mesh
});

//Use the Babylon GUI system to create an AdvancedDynamicTexture that will the updated with our label content
let advancedTexture = AdvancedDynamicTexture.CreateForMesh(hoverPlane);

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
hoverPlane.billboardMode = 7; //Set billboard mode to always face camera
hoverPlane.isPickable = false; //Disable picking so it doesn't get in the way of interactions
hoverPlane.renderingGroupId = 1; //Set render id higher so it always renders in front

export function updateHoverPlaneText(text) {
    label.text = text;
}

// UI Manager and NearMenu
export const guiManager = new GUI.GUI3DManager(scene);
export const handMenu = new GUI.HandMenu(xr.baseExperience, "menu");

const handConstraintBehavior = handMenu.handConstraintBehavior;
handConstraintBehavior.gazeProximityRadius = 0.5;
handConstraintBehavior.palmUpStrictness = 0.5;

guiManager.addControl(handMenu);
handMenu.backPlateMargin = 0.1;
handMenu.scaling = new Vector3(0.08, 0.08, 0.08);
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
export const recommendButton = createButton("recommend", "Recommend", () => console.log("Recommend Clicked"));
export const deleteButton = createButton("delete", "Delete", () => console.log("Delete Clicked"));
export const clearSelectionButton = createButton("clearSelection", "Clear Selection", () => console.log("Clear Selection Clicked"));
export const unpinNodesButton = createButton("unpinNodes", "Unpin Nodes", () => console.log("Unpin Nodes Clicked"));
export const toggleLinksButton = createButton("toggleLinks", "Toggle Links", () => console.log("Toggle Links Clicked"));

handMenu.addButton(recommendButton);
handMenu.addButton(deleteButton);
handMenu.addButton(clearSelectionButton);
handMenu.addButton(unpinNodesButton);
handMenu.addButton(toggleLinksButton);

// Start render loop
engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});
