/* eslint-disable no-undef */
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.8')


onmessage = async function(event) {


    console.log("starting load")
    const url = 'http://localhost:3000/models/mobilenet-tflite/detect.tflite';

    await tflite.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.8/wasm/')

    console.log("BE set")
    const model = await tflite.loadTFLiteModel(url)

    console.log("model loaded")
    console.log(model)


};
