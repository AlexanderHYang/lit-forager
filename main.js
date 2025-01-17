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
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
  forceCollide,
} from "d3-force-3d"; //External required dependency for force layouts
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
const babylonEngine = new Engine(canvas, true);

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
camera.wheelPrecision = 20; // Adjust the sensitivity of the mouse wheel's zooming
camera.minZ = 0; // Adjust the distance of the camera's near plane
camera.attachControl(true); // Allow the camera to respond to user controls
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
let CoT = anu.bind("cot", "cot");

//We will be using instancing, so create a sphere mesh to be the root of our instanced meshes
let rootSphere = anu.create("sphere", "node");
rootSphere.isVisible = false;
rootSphere.material = new StandardMaterial("mat");
rootSphere.material.specularColor = new Color3(0, 0, 0);
rootSphere.registerInstancedBuffer("color", 4);
rootSphere.instancedBuffers.color = new Color4(0, 0, 0, 1);

//Create the spheres for our network and set their properties
let nodes = CoT.bindInstance(rootSphere, leMis.nodes)
  .position((d) => new Vector3(d.x, d.y, d.z))
  .scaling(new Vector3(6, 6, 6))
  .id((d) => d.name)
  .setInstancedBuffer("color", (d) => scaleC(d.group));

//Create a plane mesh that will serve as the basis for our details on demand label
const hoverPlane = anu.create("plane", "hoverPlane", { width: 10, height: 10 });
hoverPlane.isPickable = false; //Disable picking so it doesn't get in the way of interactions
hoverPlane.renderingGroupId = 1; //Set render id higher so it always renders in front

//Use the Babylon GUI system to create an AdvancedDynamicTexture that will the updated with our label content
let advancedTexture = AdvancedDynamicTexture.CreateForMesh(hoverPlane);

//Create a rectangle for the background
let UIBackground = new Rectangle();

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

label.text = " ";
UIBackground.addControl(label);

//Hide the plane until it is needed
hoverPlane.isVisible = false;
//Set billboard mode to always face camera
hoverPlane.billboardMode = 7;

//We will be using a lineSystem mesh for our edges which takes a two dimension array and draws a line for each sub array.
//lineSystems use one draw call for all line meshes and will be the most performant option
//This function helps prepare our data for that data structure format.
let updateLines = (data) => {
  let lines = [];
  data.forEach((v, i) => {
    let start = new Vector3(v.source.x, v.source.y, v.source.z);
    let end = new Vector3(v.target.x, v.target.y, v.target.z);
    lines.push([start, end]);
  });
  return lines;
};

//Create our links using our data and function from above
let links = CoT.bind(
  "lineSystem",
  { lines: (d) => updateLines(d), updatable: true },
  [leMis.links]
)
  .prop("color", new Color4(1, 1, 1, 1))
  .prop("alpha", 0.3);

//Use the run method to access our root node and call normalizeToUnitCube to scale the visualization down to 1x1x1
CoT.run((d, n) => {
  n.normalizeToUnitCube();
});

//Update the position of the nodes and links each time the simulation ticks.
function ticked() {
  //For the instanced spheres just set a new position
  nodes.position((d) => new Vector3(d.x, d.y, d.z));

  //For the links use the run method to replace the lineSystem mesh with a new one.
  //The option instance takes the old mesh and replaces it with a new mesh.
  links.run((d, n, i) =>
    anu.create(
      "lineSystem",
      "edge",
      { lines: updateLines(d), instance: n, updatable: true },
      d
    )
  );

  // Add hover effects on nodes
  nodes.run((d, n, i) => {
    n.actionManager = new BABYLON.ActionManager(scene);
    n.actionManager.registerAction(
      new BABYLON.InterpolateValueAction(
        BABYLON.ActionManager.OnPointerOverTrigger,
        n,
        "scaling",
        new Vector3(8.5, 8.5, 8.5),
        150
      )
    );
    n.actionManager.registerAction(
      new BABYLON.InterpolateValueAction(
        BABYLON.ActionManager.OnPointerOutTrigger,
        n,
        "scaling",
        new Vector3(6, 6, 6),
        150
      )
    );
    n.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOverTrigger,
        () => {
          hoverPlane.isVisible = true;
          label.text = "test";
          hoverPlane.position = n.position;
          console.log(hoverPlane.isVisible);
          console.log(hoverPlane.position);
        }
      )
    );

    n.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOutTrigger,
        () => {
          hoverPlane.isVisible = false;
          console.log(hoverPlane.isVisible);
          console.log(hoverPlane.position);
        }
      )
    );
  });
}

// Node Label Creation
// nodes.run((d, n, i) => {
//   let label = anu.createPlaneText(
//     "text2d",
//     {
//       text: "Hello World",
//       color: Color3.Green(),
//       size: 0.1,
//     },
//     scene
//   );
//   console.log(d.y);

//   label.setEnabled(false);
//   n.actionManager.registerAction(
//     new BABYLON.ExecuteCodeAction(
//       BABYLON.ActionManager.OnPointerOverTrigger,
//       () => {
//         label.setEnabled(true); // Show the label
//       }
//     )
//   );
//   n.actionManager.registerAction(
//     new BABYLON.ExecuteCodeAction(
//       BABYLON.ActionManager.OnPointerOutTrigger,
//       () => {
//         label.setEnabled(false); // Hide the label
//       }
//     )
//   );
// });

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
