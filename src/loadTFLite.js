/* eslint-disable no-undef */
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.9')


let objectDetector;
const MODEL_URL = '/models/mobilenet-tflite/detect.tflite';
const CONFIDENCE_THRESHOLD = 0.95;  // Minimum confidence threshold
const MODEL_SIZE = 320;

onmessage = async function(e) {
    if (e.data?.type === 'DETECT') {
        await detect(e.data);
    } else if (e.data?.type === 'LOAD_MODEL') {
        await tflite.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/wasm/')
        objectDetector = await tflite.loadTFLiteModel(MODEL_URL)
        postMessage({ type: 'MODEL_LOADED' });
    }
};


const preprocessFrame = async (data) => {
    return tf.tidy(() => {
        const inputTensor = tf.image.resizeBilinear(tf.browser.fromPixels(data.imageData), [MODEL_SIZE, MODEL_SIZE]);
        const normalizedTensor = inputTensor
            .asType('float32')
            .div(127.5)
            .sub(1)
            .expandDims(0);
        return normalizedTensor;
    });
};

async function detect(data) {
    if (!objectDetector) return;
    const inputTensor = await preprocessFrame(data);

    let predictions;
    try {
        const inputName = 'serving_default_input:0';
        predictions = await objectDetector.predict({ [inputName]: inputTensor });
        tf.dispose(inputTensor);
    } catch (error) {
        console.error('Error during model prediction:', error);
        return;
    }

    const boxes = predictions['StatefulPartitionedCall:3']?.dataSync() || [];
    const scores = predictions['StatefulPartitionedCall:1']?.dataSync() || [];

    if (boxes && scores && boxes.length > 0) {
        const frameWidth = data.videoWidth; // Actual width of the video
        const frameHeight = data.videoHeight; // Actual height of the video
        const score = scores[0];

        // Convert normalized coordinates to pixel coordinates based on video dimensions
        const ymin = boxes[0] * frameHeight; // Convert to pixel
        const xmin = boxes[1] * frameWidth; // Convert to pixel
        const ymax = boxes[2] * frameHeight; // Convert to pixel
        const xmax = boxes[3] * frameWidth; // Convert to pixel

        // Ensure bounding box values stay within video dimensions
        const left = Math.max(0, xmin);
        const top = Math.max(0, ymin - 15);
        const right = Math.min(frameWidth, xmax - 30);
        const bottom = Math.min(frameHeight, ymax - 20);

        // Calculate width and height
        const width = right - left;
        const height = bottom - top;

        // Only send the box if it is valid
        if (width > 0 && height > 0) {
            let results = {isInside: false, isValidSize: false};
            if (parseFloat(score) > CONFIDENCE_THRESHOLD) {
                results = isBoxInsideGrayArea(data.videoWidth, data.videoHeight, data.boxWidth, data.boxHeight, {ymin, xmin, ymax, xmax, score})
            }
            postMessage({ type: 'PREDICTION', values: {
                left,
                top,
                width,
                height,
                confidence: score,
                ...results,
            } });
        } else {
            postMessage({ type: 'PREDICTION_FAILED' });
        }
        
    } else {
        console.error('Boxes or scores are undefined');
        postMessage({ type: 'PREDICTION_FAILED' });
    }
}

// Function to calculate if the box is inside the gray area
const isBoxInsideGrayArea = (videoW, videoH, boxWidth, boxHeight, prediction) => {
    const { ymin, xmin, ymax, xmax } = prediction;

    const sizeMargin = 0.15;
    const marginInside = 0.7;
    const marginOutside = 0.5;
    const marginVertical = 0.90;

    const grayAreaTop = (videoH - boxHeight) / 2;
    const grayAreaBottom = grayAreaTop + boxHeight;
    const grayAreaLeft = (videoW - boxWidth) / 2;
    const grayAreaRight = grayAreaLeft + boxWidth;

    const topOk = ymin >= (grayAreaTop * marginOutside) && ymin <= (grayAreaTop + (grayAreaTop * marginInside));
    const bottomOk = ymax >= (grayAreaBottom - (grayAreaTop * marginOutside)) && ymax <= (grayAreaBottom + (grayAreaTop * marginInside));
    const leftOk = xmin >= (grayAreaLeft * marginOutside) && xmin <= (grayAreaLeft + (grayAreaLeft * marginInside));
    const rightOk = xmax >= (grayAreaRight * marginVertical) && xmax <= (grayAreaRight + (grayAreaLeft * marginInside));

    const isInside = topOk && bottomOk && leftOk && rightOk;

    const predictedWidth = xmax - xmin;
    const predictedHeight = ymax - ymin;

    const minWidth = boxWidth * (1 - sizeMargin);
    const minHeight = boxHeight * (1 - sizeMargin);

    const isValidSize = predictedWidth >= minWidth && predictedHeight >= minHeight;

    return { isInside, isValidSize };
};
