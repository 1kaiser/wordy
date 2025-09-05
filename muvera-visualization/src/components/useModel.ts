import { useState, useRef, useCallback } from "react";
import {
  env,
  AutoModel,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type ProgressInfo,
} from "@huggingface/transformers";

interface ModelLoaderState {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  progress: number;
  status: string;
}

export interface ModelInstance {
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
  device: "webgpu" | "wasm";
}

// Singleton cache for the model instance and loading promise
const modelCache: {
  instance: ModelInstance | null;
  loadingPromise: Promise<ModelInstance> | null;
} = {
  instance: null,
  loadingPromise: null,
};

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";

async function checkWebGPUAvailability() {
  try {
    if (!navigator.gpu) return false;
    return !!(await navigator.gpu.requestAdapter());
  } catch (error) {
    console.error("Error checking WebGPU availability:", error);
    return false;
  }
}

export const useModel = () => {
  const [state, setState] = useState<ModelLoaderState>({
    isLoading: false,
    isReady: !!modelCache.instance,
    error: null,
    progress: modelCache.instance ? 100 : 0,
    status: modelCache.instance ? "Ready" : "Waiting to start...",
  });

  const instanceRef = useRef<ModelInstance | null>(modelCache.instance);

  const loadModel = useCallback(async () => {
    if (instanceRef.current) {
      return instanceRef.current;
    }

    if (modelCache.loadingPromise) {
      try {
        const instance = await modelCache.loadingPromise;
        instanceRef.current = instance;
        setState((prev) => ({
          ...prev,
          isReady: true,
          isLoading: false,
          status: "Ready",
        }));
        return instance;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load model";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: "Error loading model",
        }));
        throw error;
      }
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: 0,
      status: "Initializing...",
    }));

    const loadingPromise = (async () => {
      try {
        const progress_callback = (progress: ProgressInfo) => {
          if (
            progress.status === "progress" &&
            progress.file.endsWith(".onnx_data")
          ) {
            const percentage = Math.round(
              (progress.loaded / progress.total) * 100,
            );
            setState((prev) => ({
              ...prev,
              progress: percentage,
              status: `Loading model... ${percentage}%`,
            }));
          }
        };

        setState((prev) => ({
          ...prev,
          status: "Setting up tokenizer...",
          progress: 0,
        }));
        const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

        setState((prev) => ({
          ...prev,
          status: "Loading model...",
          progress: 0,
        }));

        // If wasm, we proxy inference to a web worker to avoid the UI freezing
        const isWebGPUAvailable = await checkWebGPUAvailability();
        env.backends.onnx.wasm!.proxy = !isWebGPUAvailable;
        const device: "webgpu" | "wasm" = isWebGPUAvailable ? "webgpu" : "wasm";

        const model = await AutoModel.from_pretrained(MODEL_ID, {
          device,
          dtype: "q4",
          model_file_name: isWebGPUAvailable ? "model_no_gather" : "model",
          progress_callback,
        });

        const instance = { model, tokenizer, device };
        instanceRef.current = instance;
        modelCache.instance = instance;
        modelCache.loadingPromise = null;

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isReady: true,
          progress: 100,
          status: "Ready. Enter sentences and generate the galaxy!",
        }));
        return instance;
      } catch (error) {
        modelCache.loadingPromise = null;
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load model";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: "An error occurred",
        }));
        throw error;
      }
    })();

    modelCache.loadingPromise = loadingPromise;
    return loadingPromise;
  }, []);

  return {
    ...state,
    instance: instanceRef.current,
    loadModel,
  };
};