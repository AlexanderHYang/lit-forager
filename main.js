import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import {
    Scene,
    HemisphericLight,
    ArcRotateCamera,
    StandardMaterial,
    Vector3,
    Color3,
    Color4,
    Engine,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import { forceSimulation, forceCenter, forceManyBody, forceLink, forceCollide } from "./d3-force-3d/src/index.js"; //External required dependency for force layouts
import * as d3 from "d3";
import * as anu from "@jpmorganchase/anu"; //import anu, this project is using a local import of babylon js located at ../babylonjs-anu this may not be the latest version and is used for simplicity.
import leMis from "./data/miserables-trimmed.json" assert { type: "json" };
import * as BABYLON from "@babylonjs/core";
import * as APIUtils from "./api.js"
import { removeItem } from "./utils.js";

// Initialize graph
const initialPaperIds = ["f9c602cc436a9ea2f9e7db48c77d924e09ce3c32"]
// const paperData = [
//     {
//     "paperId" : "10",
//     "title" : "a",
//     "references" : [{"paperId" : "11"}]
//     },
//     {
//     "paperId" : "9",
//     "title" : "A",
//     "references" : [{"paperId" : "10"}]
//     },
// ];
// const linkData = [{"source" : 0, "target": 1}];
const paperData = await APIUtils.getDetailsForMultiplePapers(initialPaperIds);
const citationLinkData = []
const recommendationLinkData = [];

let useCitationLinks = true;


const selectedIds = [];

//Grab DOM element where we will attach our canvas. #app is the id assigned to an empty <div> in our index.html
const app = document.querySelector("#app");
//Create a canvas element and append it to #app div
const canvas = document.createElement("canvas");
app.appendChild(canvas);

//initialize babylon engine, passing in our target canvas element, and create a new scene
const babylonEngine = new Engine(canvas, true, { stencil: true });

//create a scene object using our engine
const scene = new Scene(babylonEngine);

//Add lights and a camera
let light = new HemisphericLight("light1", new Vector3(0, 10, 0), scene);
light.diffuse = new Color3(1, 1, 1);
light.specular = new Color3(1, 1, 1);
light.groundColor = new Color3(1, 1, 1);

//Add a camera that rotates around the origin and adjust its properties
const camera = new ArcRotateCamera(
    "Camera",
    -(Math.PI / 4) * 3,
    Math.PI / 4,
    10,
    new Vector3(0, 0, 0),
    scene
);
camera.wheelPrecision = 20;     // Adjust the sensitivity of the mouse wheel's zooming
camera.minZ = 0;                // Adjust the distance of the camera's near plane
camera.attachControl(true);     // Allow the camera to respond to user controls
camera.position = new Vector3(0, 0, -1.5);

//Create a D3 color scale that returns a Color4 for our nodes
const scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor4());

//Create a D3 simulation with several forces
const simulation = forceSimulation(paperData, 3)
    .force("link", forceLink(citationLinkData)
        .distance(0.1)
        .strength(2)
    )
    .force("charge", forceManyBody()
        .strength(-0.005)
    )
    .force("collide", forceCollide()
        .radius(0.01)
        .strength(2)
    )
    // .force("center", forceCenter(0, 0, 0))
    .on("tick", ticked)
    .on("end", () => simulation.stop());

//Create a Center of Transform TransformNode using create() that serves the parent node for all our meshes that make up our network
const CoT_babylon = anu.create("cot", "cot");
const CoT = anu.selectName("cot", scene);


//Create a Babylon HighlightLayer that will allow us to add a highlight stencil to meshes
const highlighter = new BABYLON.HighlightLayer("highlighter", scene);

//Create a plane mesh that will serve as the basis for our details on demand label
// const hoverPlane = anu.create('plane', 'hoverPlane', {width: 1, height: 1});
let hoverPlane = null;
CoT.bind("plane", { width: 0.6, height: 0.6 }, [{}]).run((d, n) => {
    hoverPlane = n; // Get the first created mesh
});
// console.log("Hover Plane:", hoverPlane); // Should now reference the plane

hoverPlane.isPickable = false;      //Disable picking so it doesn't get in the way of interactions
hoverPlane.renderingGroupId = 1;    //Set render id higher so it always renders in front

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
label.text = " ";
UIBackground.addControl(label);

//Hide the plane until it is needed
hoverPlane.isVisible = false;
//Set billboard mode to always face camera
hoverPlane.billboardMode = 7;

//Create the spheres for our network and set their properties
//bind(mesh: string, options?: {}, data?: {}, scene?: Scene)
let nodes;
function createNodes(papers) {

    hoverPlane.isVisible = false;

    // Dispose of existing nodes
    if (nodes) {
        ticked();
        nodes.run((d, n, i) => {
            n.dispose(); // Remove from Babylon.js scene
        });
        nodes = null; // Clear Anu selection
    }

    // Remove nodes from force simulation
    // simulation.nodes([]); // Reset simulation nodes

    // console.log("position data from paperData when creating nodes")
    nodes = CoT.bind("sphere", {}, papers)
        .position((d) => {
            // console.log(d.x, d.y, d.z);
            return new Vector3(d.x, d.y, d.z)
        })
        .scaling((d) => new Vector3(0.02, 0.02, 0.02))
        .material((d) => {
            let mat = new StandardMaterial("mat");
            mat.specularColor = new Color3(0, 0, 0);
            mat.diffuseColor = scaleC(d.group);
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
                    highlighter.addMesh(n, Color3.White());
                    scene.setRenderingAutoClearDepthStencil(1, true, true, false);
                    //Show and adjust the label
                    hoverPlane.isVisible = true;
                    label.text = d.title;
                    hoverPlane.position = n.position.add(new Vector3(0, 0.04, 0)); //Add vertical offset
                    highlighter.addExcludedMesh(hoverPlane);
                })
        )
        //Add an action that will undo the above when the pointer is moved away from the sphere mesh
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOutTrigger, () => {
                    //Same as above but in reverse
                    if (!selectedIds.includes(d.paperId)) {
                        highlighter.removeMesh(n);
                    }
                    hoverPlane.isVisible = false;
                })
        )
        // on pick down action to select ndoes
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickDownTrigger, () => {
                    if (!selectedIds.includes(d.paperId)) {
                        selectedIds.push(d.paperId);
                    } else {
                        removeItem(selectedIds, d.paperId);
                    }
                })
        )
        // on pick up action for selecting nodes
        .action(
            (d, n, i) =>
                new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickUpTrigger, () => {
                })
        );

    // Add SixDofDrag behavior
    nodes.run((d, n, i) => {
        let dragBehavior = new BABYLON.SixDofDragBehavior();
        dragBehavior.dragDeltaRatio = 0.2;
        dragBehavior.rotateDraggedObject = true;
        dragBehavior.detachCameraControls = true;
        dragBehavior.onPositionChangedObservable.add((data) => {
            d.x = n.position.x;
            d.y = n.position.y;
            d.z = n.position.z;

            // Fix node in place by reducing its velocity in the simulation
            d.fx = n.position.x;
            d.fy = n.position.y;
            d.fz = n.position.z;

            hoverPlane.isVisible = true;
            label.text = d.title;
            hoverPlane.position = n.position.add(new Vector3(0, 0.04, 0)); //Add vertical offset
        });
        dragBehavior.onDragObservable.add((data) => {
            simulation.alpha(0.1);
            console.log("hello");
        });
        dragBehavior.onDragEndObservable.add(() => {
            // Release node from being fixed in place
            // delete d.fx;
            // delete d.fy;
            // delete d.fz;

            // let the simulation relax
            simulation.alpha(0.1);
        });
        n.addBehavior(dragBehavior);
    });

    // re-add highlight layer to selected nodes
    nodes.run((d,n,i) => {
        if (selectedIds.includes(d.paperId)) {
            highlighter.addMesh(n, Color3.White());
            scene.setRenderingAutoClearDepthStencil(1, true, true, false);
            highlighter.addExcludedMesh(hoverPlane);
        }
    });

    // add list of papers recommended by this one (to be populated later)
    nodes.run((d,n,i) => {
        if (!d.recommends) {
            d.recommends = [];
        }
    })
}
createNodes(paperData);

//We will be using a lineSystem mesh for our edges which takes a two dimension array and draws a line for each sub array.
//lineSystems use one draw call for all line meshes and will be the most performant option
//This function helps prepare our data for that data structure format.
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

//Create our links using our data and function from above
let links;
function createLinks(data) {
    if (links) {
        links.run((d,n,i) => {
            n.dispose();
        })
    }
    links = CoT.bind("lineSystem", { lines: (d) => {
        let l = updateLines(d);
        console.log(l);
        return l;
        }, updatable: true }, [data])
        .prop("color", new Color4(1, 1, 1, 1))
        .prop("alpha", 0.3)
        .prop("isPickable", false);

    simulation.force("link", forceLink(data)
    .distance(0.1)
    .strength(2));
}
createLinks(citationLinkData);


//Update the position of the nodes and links each time the simulation ticks.
function ticked() {
    // console.log("ticked: simulation data from here");
    //For the instanced spheres just set a new position
    nodes.position((d, n) => {
        // console.log(d.x, d.y, d.z, d.vx, d.vy, d.vz);
        return new Vector3(d.x, d.y, d.z);
    });

    //For the links use the run method to replace the lineSystem mesh with a new one.
    //The option instance takes the old mesh and replaces it with a new mesh.
    links.run((d, n, i) =>
        anu.create("lineSystem", "edge", { lines: updateLines(d), instance: n, updatable: true }, d)
    );
}

const env = scene.createDefaultEnvironment();

// Assuming 'env.ground' is your ground mesh
const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);

// Set the transparency
groundMaterial.alpha = 0.0; // Adjust this value as needed
groundMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;

// Apply the material to the ground mesh
env.ground.material = groundMaterial;
env.ground.setAbsolutePosition(new BABYLON.Vector3(0, -1, 0));

// Enable XR
const xr = await scene.createDefaultXRExperienceAsync({
    floorMeshes: [env.ground],
    optionalFeatures: true,
});

const featureManager = xr.baseExperience.featuresManager;
// featureManager.disableFeature(BABYLON.WebXRFeatureName.TELEPORTATION);
// featureManager.enableFeature(BABYLON.WebXRFeatureName.MOVEMENT, "latest", {
//     xrInput: xr.input,
//     movementOrientationFollowsViewerPose: true, // default true
//     movementSpeed: 0.2,
//     rotationSpeed: 0.2,
// });

xr.baseExperience.sessionManager.onXRFrameObservable.addOnce(() => {
    xr.baseExperience.camera.position.set(-0.5, 0, 0);
    xr.baseExperience.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
})


// force simulation to step every frame
scene.onBeforeRenderObservable.add(() => {
    paperData.forEach((d) => {
        // console.log(d.x, d.y, d.z, d.vx, d.vy, d.vz);
    })
    // simulation.step();
    simulation.tick();
    ticked();
});

//Render the scene we created
babylonEngine.runRenderLoop(() => {
    scene.render();
});

//Listen for window size changes and resize the scene accordingly
window.addEventListener("resize", function () {
    babylonEngine.resize();
});

// hide/show the Inspector
window.addEventListener("keydown", (ev) => {
    // Shift+Ctrl+Alt+I
    if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
        if (scene.debugLayer.isVisible()) {
            scene.debugLayer.hide();
        } else {
            scene.debugLayer.show();
        }
    }

    if (ev.key === "r") {
        console.log("r pressed");
        APIUtils.fetchRecsFromMultipleIds(selectedIds).then((d) => {
            const recommendedPapers = d.recommendedPapers.map((a) => a.paperId);
            paperData.forEach((p) => {
                if (selectedIds.includes(p.paperId)) {
                    recommendedPapers.forEach((rec) => {
                        if (!p.recommends.includes(rec)) {
                            p.recommends.push(rec);
                        }
                    })
                }
            })
            APIUtils.getDetailsForMultiplePapers(recommendedPapers).then((r) => {
                addPapersToGraph(r);
            })
        });
    }
    if (ev.key === "Backspace") {
        console.log("backspace pressed");
        removeNodesFromGraph(selectedIds);
        selectedIds.length = 0; // clear selected ids
    };
    if (ev.key === "l") {
        console.log("l pressed");
        useCitationLinks = !useCitationLinks;
        console.log(useCitationLinks);
        if (useCitationLinks) {
            createLinks(citationLinkData);
        } else {
            createLinks(recommendationLinkData);
        }
    };
});

function createLinkData(paperData) {
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

function addPapersToGraph(newPapers) {
    // paperData.forEach((d) => {console.log(d.x, d.y, d.z)});
    // const newPapers = [
    //     {
    //         "paperId": "11",
    //         "title" : "b",
    //         "references": [{"paperId" :"12"}],
    //     },
    //     {
    //         "paperId": "12",
    //         "title" : "c",
    //         "references": [{"paperId" : "10"}],
    //     }
    // ];

    // Notes: 
    // 1) Nodes might need to be locked in place prior to adding to simulation,
    // since we don't want nodes to move around wildly when adding new ones
    // 
    // 2) createNodes() can only be called after nodes are added to simulation since
    // it relies on the x, y, z positions of the nodes which is initialized by the simulation

    // Add new papers to paperData
    newPapers.forEach((p) => {
        if (!paperData.find((d) => d.paperId === p.paperId)) { // don't add duplicates
            paperData.push(p);
        }
    });

    paperData.forEach((d) => { // lock nodes in place before simulation
        d.fx = d.x;
        d.fy = d.y;
        d.fz = d.z;
    });
    simulation.nodes(paperData);
    //simulation.alpha(0.05);
    paperData.forEach((d) => { // undo lock nodes in place after simulation
        delete d.fx;
        delete d.fy;
        delete d.fz;
    });

    createNodes(paperData);
    createLinkData(paperData);

    console.log("citation link data:", citationLinkData);
    console.log("recommendation link data:", recommendationLinkData);

    if (useCitationLinks) {
        createLinks(citationLinkData);
    } else {
        createLinks(recommendationLinkData);
    }
}

function removeNodesFromGraph(idsToRemove) {
    // Mutate paperData in place
    for (let i = paperData.length - 1; i >= 0; i--) {
        if (idsToRemove.includes(paperData[i].paperId)) {
            paperData.splice(i, 1);  // Remove the element in place
        }
    }

    // Mutate linkData in place
    for (let i = citationLinkData.length - 1; i >= 0; i--) {
        if (idsToRemove.includes(citationLinkData[i].source.paperId) || idsToRemove.includes(citationLinkData[i].target.paperId)) {
            citationLinkData.splice(i, 1);  // Remove the element in place
        }
    }
    for (let i = recommendationLinkData.length - 1; i >= 0; i--) {
        if (idsToRemove.includes(recommendationLinkData[i].source.paperId) || idsToRemove.includes(recommendationLinkData[i].target.paperId)) {
            recommendationLinkData.splice(i, 1);  // Remove the element in place
        }
    }

    createNodes(paperData);
    if (useCitationLinks) {
        createLinks(citationLinkData);
    } else {
        createLinks(recommendationLinkData);
    }
}
