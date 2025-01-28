import{g as e}from"./index-c34e7bd4.js";const i="sceneUboDeclaration",n=`struct Scene {viewProjection : mat4x4<f32>,
#ifdef MULTIVIEW
viewProjectionR : mat4x4<f32>,
#endif 
view : mat4x4<f32>,
projection : mat4x4<f32>,
vEyePosition : vec4<f32>,};var<uniform> scene : Scene;
`;e.IncludesShadersStoreWGSL[i]=n;const o="meshUboDeclaration",t=`struct Mesh {world : mat4x4<f32>,
visibility : f32,};var<uniform> mesh : Mesh;
#define WORLD_UBO
`;e.IncludesShadersStoreWGSL[o]=t;const r="mainUVVaryingDeclaration",a=`#ifdef MAINUV{X}
varying vMainUV{X}: vec2f;
#endif
`;e.IncludesShadersStoreWGSL[r]=a;
