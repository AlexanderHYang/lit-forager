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
    toggleLinkType,
    addCitationsFromSelectedPaper,
    addReferencesFromSelectedPaper,
    addPapersFromAuthor,
    restoreDeletedPapers,
    connectSelectedNodes,
    createClusters
} from "./graph";
import "@babylonjs/inspector";
import { timeout } from "d3";
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
scene.setRenderingAutoClearDepthStencil(2, false);
highlighter.blurHorizontalSize = 0.8;
highlighter.blurVerticalSize = 0.8;

export const hoverPlane = BABYLON.MeshBuilder.CreatePlane(
    "hoverPlane",
    { width: 0.4, height: 0.4 },
    scene
);
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
UIBackground.thickness = 1;
UIBackground.background = "White";
advancedTexture.addControl(UIBackground);

const hoverPlaneTextPanel = new StackPanel();
hoverPlaneTextPanel.isVertical = true;
hoverPlaneTextPanel.adaptWidthToChildren = true;
hoverPlaneTextPanel.adaptHeightToChildren = true;
UIBackground.addControl(hoverPlaneTextPanel);

//Create an empty text block
let label = new TextBlock();
label.paddingLeftInPixels = 25;
label.paddingRightInPixels = 25;
label.fontSizeInPixels = 50;
label.resizeToFit = true;
label.textWrapping = true;
label.text = " ";
hoverPlaneTextPanel.addControl(label);

let clusterLabel = new TextBlock();
clusterLabel.paddingLeftInPixels = 25;
clusterLabel.paddingRightInPixels = 25;
clusterLabel.fontSizeInPixels = 50;
clusterLabel.resizeToFit = true;
clusterLabel.textWrapping = true;
clusterLabel.text = "";
clusterLabel.isVisible = false;
hoverPlaneTextPanel.addControl(clusterLabel);

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
        });
    }
    const reversePos = hoverPlane.position.add(hoverPlane.position.subtract(currCam.position));
    hoverPlane.lookAt(reversePos);
    // hoverPlane.lookAt(currCam.position);
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

        label.text = d.title;
        if (d.clusterName) {
            clusterLabel.text = `Cluster: ${d.clusterName}`;
            clusterLabel.isVisible = true;
        } else {
            clusterLabel.isVisible = false;
        }

        hoverPlane.position = n.position.add(new Vector3(0, 0.08, 0)); // Add vertical offset

        if (hoverPlaneId !== paperDetailsPanelId) {
            hoverPlane.isVisible = true;
        }
    }
}

// UI Manager and NearMenu
export const guiManager = new GUI.GUI3DManager(scene);
export const handMenu = new GUI.HandMenu(xr.baseExperience, "menu");

function hideMenu(menu) {
    menu.scaling = new Vector3(0, 0, 0);
    menu.isPickable = false;
}
function showMenu(menu) {
    menu.scaling = new Vector3(0.06, 0.06, 0.06);
    menu.isPickable = true;
}

const handConstraintBehavior = handMenu.handConstraintBehavior;
handConstraintBehavior.palmUpStrictness = 0.8;
handConstraintBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
handConstraintBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
handConstraintBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
handConstraintBehavior.targetOffset = 0.15;
handMenu.columns = 2;

guiManager.addControl(handMenu);
handMenu.backPlateMargin = 0.1;
handMenu.scaling = new Vector3(0.06, 0.06, 0.06);

// Helper function to create UI buttons
const createButton = (name, text) => {
    // add default properties here
    const button = new GUI.TouchHolographicButton(name);
    button.text = text;
    return button;
};

// Exported UI buttons
export const recommendButton = createButton("recommend", "Recommend");
export const deleteButton = createButton("delete", "Delete");
export const clearSelectionButton = createButton("clearSelection", "Clear Selection");
export const unpinNodesButton = createButton("unpinNodes", "Unpin Nodes");
export const toggleLinksButton = createButton("toggleLinks", "Toggle Links");
export const connectNodesButton = createButton("connectNodes", "Connect Nodes");
export const clusterNodesButton = createButton("clusterNodes", "Cluster Nodes");

// Attach UI button behaviors
recommendButton.onPointerClickObservable.add(() => {
    console.log("Recommend button pressed");

    hideMenu(handMenu);
    showMenu(recommendationsMenu);

    if (selectedIds.length > 1) {
        recByAuthorButton.color = "grey";
        recByCitationButton.color = "grey";
        recByReferenceButton.color = "grey";
    }
    // addRecommendationsFromSelectedPapers();
});
deleteButton.onPointerClickObservable.add(() => {
    console.log("Delete button pressed");
    removeSelectedNodesFromGraph();
});
clearSelectionButton.onPointerClickObservable.add(() => {
    console.log("Clear Selection button pressed");
    clearNodeSelection();
});
unpinNodesButton.onPointerClickObservable.add(() => {
    console.log("Unpin Nodes button pressed");
    unpinNodes();
});
toggleLinksButton.onPointerClickObservable.add(() => {
    console.log("Toggle Links button pressed");
    toggleLinkType();
});
connectNodesButton.onPointerClickObservable.add(() => {
    console.log("Connect Nodes button pressed");
    connectSelectedNodes();
});
clusterNodesButton.onPointerClickObservable.add(() => {
    console.log("Cluster Nodes button pressed");
    createClusters();
});

handMenu.addButton(recommendButton);
handMenu.addButton(deleteButton);
handMenu.addButton(clearSelectionButton);
handMenu.addButton(unpinNodesButton);
handMenu.addButton(toggleLinksButton);
handMenu.addButton(connectNodesButton);
handMenu.addButton(clusterNodesButton);


// add extra hand menus
const recommendationsMenu = new GUI.HandMenu(xr.baseExperience, "recommendationsMenu");

const recommendationsMenuBehavior = recommendationsMenu.handConstraintBehavior;
recommendationsMenuBehavior.palmUpStrictness = 0.8;
recommendationsMenuBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
recommendationsMenuBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
recommendationsMenuBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
recommendationsMenuBehavior.targetOffset = 0.15;
recommendationsMenu.columns = 1;

guiManager.addControl(recommendationsMenu);
recommendationsMenu.backPlateMargin = 0.1;
recommendationsMenu.scaling = new Vector3(0.06, 0.06, 0.06);

const recByThematicButton = createButton("recByThematic", "By Thematic");
const recByCitationButton = createButton("recByCitation", "By Citation");
const recByReferenceButton = createButton("recByReference", "By Reference");
const recByAuthorButton = createButton("recByAuthor", "By Author");
const recBackButton = createButton("recBack", "Back");

recommendationsMenu.addButton(recBackButton);
recommendationsMenu.addButton(recByAuthorButton);
recommendationsMenu.addButton(recByReferenceButton);
recommendationsMenu.addButton(recByCitationButton);
recommendationsMenu.addButton(recByThematicButton);

recByThematicButton.onPointerClickObservable.add(() => {
    console.log("Recommend by thematic button pressed");
    addRecommendationsFromSelectedPapers();
});
recByCitationButton.onPointerClickObservable.add(() => {
    console.log("Recommend by citation button pressed");
    addCitationsFromSelectedPaper();
});
recByReferenceButton.onPointerClickObservable.add(() => {
    console.log("Recommend by reference button pressed");
    addReferencesFromSelectedPaper();
});
recByAuthorButton.onPointerClickObservable.add(() => {
    console.log("Recommend by author button pressed");
    // addPapersFromAuthor();
    generateAuthorButtons();
    hideMenu(recommendationsMenu);
    showMenu(authorMenu);
});
recBackButton.onPointerClickObservable.add(() => {
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

        // handMenu buttons
        if (selectedIds.length !== 2) {
            connectNodesButton.isVisible = false;
        } else {
            connectNodesButton.isVisible = true;
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
        console.error("Error: Could not find author data for selected node");
        return;
    }
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
let loadedGUI = await panelTexture.parseFromSnippetAsync("#R4A2E9#14");

let paperDetailPanelBackground = panelTexture.getControlByName("paperDetailPanelBackground");
let paperDetailStackPanel = paperDetailPanelBackground.getChildByName("paperDetailStackPanel");
let titleBlock = paperDetailStackPanel.getChildByName("titleBlock");
let authorBlock = paperDetailStackPanel.getChildByName("authorBlock");
let metadataTextBlock = paperDetailStackPanel.getChildByName("metadataTextBlock");

let abstractPanelBackground = panelTexture.getControlByName("abstractPanelBackground");
let abstractPanelStackPanel = abstractPanelBackground.getChildByName("abstractPanelStackPanel");
let abstractTitleTextBlock = abstractPanelStackPanel.getChildByName("abstractTitleTextBlock");
let abstractTextBlock = abstractPanelStackPanel.getChildByName("abstractTextBlock");

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

        console.log(d);
        paperDetailsPanelId = d.paperId;

        // Modifying the UI elements for each paper
        titleBlock.text = d.title;
        authorBlock.text = `${d.authors.map((a) => a.name).join(", ")}`;

        const metadata = `Citation count: ${d.citationCount}\nYear: ${d.year}\nVenue: ${d.venue}`;
        metadataTextBlock.text = metadata;

        // Limit the abstract to 2000 characters
        let abstractText = d.abstract;
        if (abstractText.length > 1800) {
            let limited = abstractText.substring(0, 1800);
            // Cut off at the last space to avoid breaking words
            const lastSpace = limited.lastIndexOf(" ");
            abstractText =
                (lastSpace > 0 ? abstractText.substring(0, lastSpace) : limited) + " ...";
        }
        abstractTextBlock.text = abstractText;

        paperDetailsPanel.isVisible = true;
        highlighter.addMesh(n, Color3.Blue());
    }
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
fullscreenUITextBlock.fontSize = 50;

fullscreenUIPlane.isVisible = false;
fullscreenUIPlane.isPickable = false;

scene.onBeforeRenderObservable.add(() => {
    if (fullscreenUIPlane.isVisible) {
        fullscreenUIPlane.position = currCam.getFrontPosition(1.5);
        fullscreenUIPlane.lookAt(currCam.position);
        fullscreenUIPlane.rotate(new Vector3(0, 1, 0), Math.PI);
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
