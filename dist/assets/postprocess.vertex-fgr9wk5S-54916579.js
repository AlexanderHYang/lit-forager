import{g as s}from"./index-c34e7bd4.js";const e="postprocessVertexShader",t=`attribute position: vec2<f32>;uniform scale: vec2<f32>;varying vUV: vec2<f32>;const madd=vec2(0.5,0.5);
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
vertexOutputs.vUV=(vertexInputs.position*madd+madd)*uniforms.scale;vertexOutputs.position=vec4(vertexInputs.position,0.0,1.0);
#define CUSTOM_VERTEX_MAIN_END
}
`;s.ShadersStoreWGSL[e]=t;const r={name:e,shader:t};export{r as postprocessVertexShaderWGSL};
