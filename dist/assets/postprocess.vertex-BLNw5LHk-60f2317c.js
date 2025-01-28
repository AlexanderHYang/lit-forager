import{g as i}from"./index-c34e7bd4.js";const e="postprocessVertexShader",o=`attribute vec2 position;uniform vec2 scale;varying vec2 vUV;const vec2 madd=vec2(0.5,0.5);
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
vUV=(position*madd+madd)*scale;gl_Position=vec4(position,0.0,1.0);
#define CUSTOM_VERTEX_MAIN_END
}`;i.ShadersStore[e]=o;const t={name:e,shader:o};export{t as postprocessVertexShader};
