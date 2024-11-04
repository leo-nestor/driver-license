/* eslint-disable no-undef */
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core");
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu");
// importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm");
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.8/dist/tf-tflite.min.js");

const MODEL_PATH = '/models/mobilenet-tflite/detect.tflite';
let objectDetector;

async function loadModel() {
    const worker = new Worker('/loadTFLite.js');
    worker.postMessage('Ping from parent');

    try {
        // Now load the model
        if (!objectDetector) {
            // tflite.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.8/wasm/')
            // objectDetector = await tflite.loadTFLiteModel(MODEL_PATH);
        }
        // Notify the main thread that the model has been loaded
        // postMessage({ type: 'MODEL_LOADED' });
    } catch (e) {
        console.error("Error loading model:", e);
    }
}

async function preprocessFrame(data) {
    const inputTensor = tf.tidy(() => {
        const imageTensor = tf.browser.fromPixels(data).resizeBilinear([320, 320]);
        const normalizedTensor = imageTensor.asType('float32').div(127.5).sub(1).expandDims(0);
        return normalizedTensor;
    });
    return inputTensor;
}

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

    postMessage({ type: 'PREDICTION', boxes, scores });
}

// Load the model on worker initialization
loadModel();

// Listen for messages from the main thread
onmessage = async (event) => {
    if (event.data.type === 'DETECT') {
        console.log("recibo on detect")
        await detect(event.data.frame);
    }
};


const CONFIDENCE_THRESHOLD = 0.999990;  // Minimum confidence threshold

async function preprocessFrame(video) {
    return tf.tidy(() => {
        const inputTensor = tf.image.resizeBilinear(tf.browser.fromPixels(video), [320, 320]); // Resize to 320x320
        const normalizedTensor = inputTensor
            .asType('float32') // Ensure the data type is float32
            .div(127.5) // Normalize to range [-1, 1]
            .sub(1)
            .expandDims(0); // Add batch dimension

        return normalizedTensor;
    });
}


async function detect(videoElement) {
    if (!objectDetector) {
        objectDetector = await tflite.loadTFLiteModel(MODEL_PATH);
    }
    const inputTensor = await preprocessFrame(videoElement); // Ensure videoElement is passed correctly
    const boxesContainer = document.querySelector(".boxes-container");
    boxesContainer.innerHTML = "";

    let predictions;
    try {
        const inputName = 'serving_default_input:0'; // This is the expected input name
        predictions = await objectDetector.predict({ [inputName]: inputTensor });
    } catch (error) {
        console.error('Error during model prediction:', error);
        return;
    }

    const boxes = predictions['StatefulPartitionedCall:3']?.dataSync() || [];
    const scores = predictions['StatefulPartitionedCall:1']?.dataSync() || [];

    if (!predictions) {
        console.error('Predictions are undefined');
        return;
    }

    
    // Proceed with drawing boxes if predictions are valid
    if (boxes && scores) {
        // I'm only insterested in the first detection
        const frameWidth = videoElement.videoWidth; // Use video variable for width
        const frameHeight = videoElement.videoHeight; // Use video variable for height
        const score = scores[0];
        const ymin = boxes[0] * frameHeight;
        const xmin = boxes[1] * frameWidth;
        const ymax = boxes[2] * frameHeight;
        const xmax = boxes[3] * frameWidth;

        const title = document.querySelector(".m-title");
        const container = document.createElement("div");
    container.textContent = "v10 - " + score.toString().slice(0,9);
    title.replaceChildren(container)
         // Check all detections
            if (score > CONFIDENCE_THRESHOLD) { // Set a confidence threshold
                const boxContainer = drawBoundingBoxes(
                    xmin,
                    ymin,
                    xmax - xmin,
                    ymax - ymin,
                    'document',
                    score,
                    'red'
                );
                boxesContainer.appendChild(boxContainer);
            }
        
    } else {
        console.error('Boxes, classes, or scores are undefined');
    }

    requestAnimationFrame(() => detect(videoElement)); // Call detect recursively with videoElement
}


// Draw bounding boxes for top 'N' detections.
function drawBoundingBoxes(left, top, width, height, className, score, color) {
    const container = document.createElement("div");
    container.classList.add("box-container");

    const box = document.createElement("div");
    box.classList.add("box");
    box.style.borderColor = color;
    box.style.borderWidth = "4px";
    container.appendChild(box);

    const label = document.createElement("div");
    label.classList.add("label");
    label.style.backgroundColor = color;
    label.textContent = `${className} (${score.toFixed(2)})`;
    container.appendChild(label);

    const inputVideoElement = document.getElementById("input-video");
    const vidRect = inputVideoElement.getBoundingClientRect();
    const offsetX = vidRect.left;
    const offsetY = vidRect.top;

    container.style.left = `${left + offsetX - 1}px`;
    container.style.top = `${top + offsetY}px`;
    box.style.width = `${width + 1}px`;
    box.style.height = `${height + 1}px`;

    return container;
}

