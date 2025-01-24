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
import { forceSimulation, forceCenter, forceManyBody, forceLink, forceCollide } from "d3-force-3d"; //External required dependency for force layouts
import * as d3 from "d3";
import * as anu from "@jpmorganchase/anu"; //import anu, this project is using a local import of babylon js located at ../babylonjs-anu this may not be the latest version and is used for simplicity.
import leMis from "./data/miserables.json" assert { type: "json" };
import * as BABYLON from "@babylonjs/core";

//Grab DOM element where we will attach our canvas. #app is the id assigned to an empty <div> in our index.html
const app = document.querySelector("#app");
//Create a canvas element and append it to #app div
const canvas = document.createElement("canvas");
app.appendChild(canvas);

//initialize babylon engine, passing in our target canvas element, and create a new scene
const babylonEngine = new Engine(canvas, true, { stencil: true });

//create a scene object using our engine
const scene = new Scene(babylonEngine);
const scale = 0.01;

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
camera.position = new Vector3(1, 1.5, -4);

//Create a D3 color scale that returns a Color4 for our nodes
const scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor4());

//Create a D3 simulation with several forces
const simulation = forceSimulation(leMis.nodes, 3)
    .force("link", forceLink(leMis.links))
    .force("charge", forceManyBody())
    .force("collide", forceCollide())
    .force("center", forceCenter(0, 0, 0))
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
CoT.bind("plane", { width: 200, height: 200 }, [{}]).run((d, n) => {
    hoverPlane = n; // Get the first created mesh
});
console.log("Hover Plane:", hoverPlane); // Should now reference the plane

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
let nodes = CoT.bind("sphere", {}, leMis.nodes)
    .position((d) => new Vector3(d.x, d.y, d.z))
    .scaling((d) => new Vector3(scale * 6, scale * 6, scale * 6))
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
                new Vector3(scale * 8.5, scale * 8.5, scale * 8.5), //The value that the property should be set to
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
                new Vector3(scale * 6, scale * 6, scale * 6),
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
                label.text = d.name;
                hoverPlane.position = n.position.add(new Vector3(0, 12, 0)); //Add vertical offset
                highlighter.addExcludedMesh(hoverPlane);
            })
    )
    //Add an action that will undo the above when the pointer is moved away from the sphere mesh
    .action(
        (d, n, i) =>
            new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOutTrigger, () => {
                //Same as above but in reverse
                highlighter.removeMesh(n);
                hoverPlane.isVisible = false;
            })
    );



// Add SixDofDrag behavior
nodes.run((d, n, i) => {
    let dragBehavior = new BABYLON.SixDofDragBehavior();
    dragBehavior.dragDeltaRatio = 1;
    dragBehavior.rotateDraggedObject = true;
    dragBehavior.detachCameraControls = true;
    dragBehavior.onPositionChangedObservable.add((data) => {
        // d.x = n.position.x;
        // d.y = n.position.y;
        // d.z = n.position.z;

        // Fix node in place by reducing its velocity in the simulation
        d.fx = n.position.x / scale;
        d.fy = n.position.y / scale;
        d.fz = n.position.z / scale;

        // simulation.alpha(0.3).restart();
    });
    dragBehavior.onDragObservable.add((data) => {
        simulation.alpha(1).restart();
    });
    dragBehavior.onDragEndObservable.add(() => {
        // Release node from being fixed in place
        // delete d.fx;
        // delete d.fy;
        // delete d.fz;

        // let the simulation relax
        simulation.alpha(0.1).restart();
    });
    n.addBehavior(dragBehavior);
});

//We will be using a lineSystem mesh for our edges which takes a two dimension array and draws a line for each sub array.
//lineSystems use one draw call for all line meshes and will be the most performant option
//This function helps prepare our data for that data structure format.
let updateLines = (data) => {
    let lines = [];
    data.forEach((v, i) => {
        let start = new Vector3(scale * v.source.x, scale * v.source.y, scale * v.source.z);
        let end = new Vector3(scale * v.target.x, scale * v.target.y, scale * v.target.z);
        lines.push([start, end]);
    });
    return lines;
};

//Create our links using our data and function from above
let links = CoT.bind("lineSystem", { lines: (d) => updateLines(d), updatable: true }, [leMis.links])
    .prop("color", new Color4(1, 1, 1, 1))
    .prop("alpha", 0.3);

//Use the run method to access our root node and call normalizeToUnitCube to scale the visualization down to 1x1x1
// CoT.run((d, n) => {
//     n.normalizeToUnitCube();
// });

//Update the position of the nodes and links each time the simulation ticks.
function ticked() {
    //For the instanced spheres just set a new position
    nodes.position((d, n) => {
        return new Vector3(scale * d.x, scale * d.y, scale * d.z);
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
groundMaterial.alpha = 0; // Adjust this value as needed
groundMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;

// Apply the material to the ground mesh
env.ground.material = groundMaterial;

// Enable XR
const xr = await scene.createDefaultXRExperienceAsync({
    floorMeshes: [env.ground],
    optionalFeatures: true,
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
});
