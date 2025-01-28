import{g as i}from"./index-c34e7bd4.js";import"./hdrFilteringFunctions-DZRf3k9A-4edcc673.js";const e="hdrFilteringPixelShader",r=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform float alphaG;uniform samplerCube inputTexture;uniform vec2 vFilteringInfo;uniform float hdrScale;varying vec3 direction;void main() {vec3 color=radiance(alphaG,inputTexture,direction,vFilteringInfo);gl_FragColor=vec4(color*hdrScale,1.0);}`;i.ShadersStore[e]=r;const l={name:e,shader:r};export{l as hdrFilteringPixelShader};
