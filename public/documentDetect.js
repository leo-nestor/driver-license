/* eslint-disable no-undef */
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm');

let model = null;

const CONFIDENCE_THRESHOLD = 0.72;
const MODEL_SIZE = 640;

const loadModel = async () => {
    const modelUrl = '/models/driver-license-mobilenet/model.json';
    try {
        model = await tf.loadGraphModel(modelUrl);
        postMessage({ type: 'modelLoaded' });
    } catch (error) {
        postMessage({ type: 'error', error: "Failed to load model." });
    }
};

// Function to calculate if the box is inside the gray area
const isBoxInsideGrayArea = (videoW, videoH, boxWidth, boxHeight, prediction) => {
    const { y_min, x_min, y_max, x_max, currentScore } = prediction;

    if (parseFloat(currentScore) < CONFIDENCE_THRESHOLD) {
        return { isInside: false, isSizeValid: false };
    }

    const scaleX = videoW / MODEL_SIZE;
    const scaleY = videoH / MODEL_SIZE;

    const scaledX_min = x_min * scaleX;
    const scaledY_min = y_min * scaleY;
    const scaledX_max = x_max * scaleX;
    const scaledY_max = y_max * scaleY;

    const margin = 0.15;
    const offsetMargin = 0.10;

    const grayAreaTop = (videoH - boxHeight) / 2;
    const grayAreaLeft = (videoW - boxWidth) / 2;
    const grayAreaBottom = grayAreaTop + boxHeight;
    const grayAreaRight = grayAreaLeft + boxWidth;

    const allowedTop = grayAreaTop - boxHeight * offsetMargin;
    const allowedLeft = grayAreaLeft - boxWidth * offsetMargin;
    const allowedBottom = grayAreaBottom + boxHeight * (offsetMargin / 2);
    const allowedRight = grayAreaRight + boxWidth * (offsetMargin / 2);

    const isInside =
        scaledY_min >= allowedTop &&
        scaledY_max <= allowedBottom &&
        scaledX_min >= allowedLeft &&
        scaledX_max <= allowedRight;

    const predictedWidth = scaledX_max - scaledX_min;
    const predictedHeight = scaledY_max - scaledY_min;

    const minWidth = boxWidth * (1 - margin);
    const minHeight = boxHeight * (1 - margin);

    const isSizeValid = predictedWidth >= minWidth && predictedHeight >= minHeight;

    return { isInside, isSizeValid };
};

// Receive messages from the main thread
onmessage = async (e) => {
    const { type, imageData, videoWidth, videoHeight, boxWidth, boxHeight } = e.data;

    if (type === 'predict' && model) {
        try {
            const startTime = performance.now(); // Start measuring time

            const img = tf.browser.fromPixels(imageData);
            const resized = tf.image.resizeBilinear(img, [MODEL_SIZE, MODEL_SIZE]);
            const batched = resized.expandDims(0).toFloat().div(tf.scalar(255));

            const predictions = await model.executeAsync(batched);
            console.log(JSON.stringify(predictions))
            const boxesAndScores = predictions.arraySync()[0];
            const [x_min, y_min, x_max, y_max, currentScore] = boxesAndScores[0];

            img.dispose();
            resized.dispose();
            batched.dispose();

            const boxCheck = isBoxInsideGrayArea(videoWidth, videoHeight, boxWidth, boxHeight, { x_min, y_min, x_max, y_max, currentScore });

            const totalTime = performance.now() - startTime; // Total time for prediction + box check

            const predictionData = {
                x_min, y_min, x_max, y_max,
                currentScore: parseFloat(currentScore.toFixed(2)),
                totalTime: totalTime, // Return combined time as a single value
                ...boxCheck
            };

            if (boxCheck.isInside && boxCheck.isSizeValid) {
                postMessage({ type: 'prediction', prediction: predictionData });
            } else {
                postMessage({
                    type: 'prediction_failed',
                    prediction: {
                        ...predictionData,
                        message: !boxCheck.isSizeValid && boxCheck.isInside
                            ? "Bring the document closer"
                            : !boxCheck.isInside && boxCheck.isSizeValid
                                ? "Place document inside the rectangle"
                                : ''
                    }
                });
            }

        } catch (error) {
            console.log(error)
            postMessage({ type: 'error', error: "Prediction failed." });
        }
    } else if (type === 'load_model') {
        tf.setBackend('wasm').then(() => loadModel());
    } 
};
