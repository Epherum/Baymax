"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionInstance = {
    continuous: boolean;
    interimResults: boolean;
    lang?: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onstart: (() => void) | null;
    onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionEventLike = {
    resultIndex: number;
    results: ArrayLike<{
        isFinal: boolean;
        0: { transcript: string };
    }>;
};

type SpeechRecognitionErrorEventLike = {
    error: string;
    message?: string;
};

type UseDictationOptions = {
    targetRef: React.RefObject<HTMLTextAreaElement | null>;
    setValue: React.Dispatch<React.SetStateAction<string>>;
    lang?: string;
};

type UseDictationState = {
    supported: boolean;
    listening: boolean;
    interimTranscript: string;
    error: string | null;
    start: () => void;
    stop: () => void;
    toggle: () => void;
};

declare global {
    interface Window {
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
        SpeechRecognition?: SpeechRecognitionConstructor;
    }
}

export function useDictation({ targetRef, setValue, lang }: UseDictationOptions): UseDictationState {
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const SpeechRecognition: SpeechRecognitionConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang || window.navigator?.language || "en-US";

        recognition.onstart = () => {
            setListening(true);
            setError(null);
            setInterimTranscript("");
        };

        recognition.onend = () => {
            setListening(false);
            setInterimTranscript("");
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
            const message = event.error === "not-allowed"
                ? "Microphone permission was denied"
                : event.error === "no-speech"
                    ? "No speech detected"
                    : "Dictation error";
            setError(message);
            setListening(false);
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
            let finalTranscript = "";
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                const transcript = res[0]?.transcript ?? "";
                if (res.isFinal) {
                    finalTranscript += transcript;
                } else {
                    interim += transcript;
                }
            }

            if (finalTranscript) {
                insertAtCursor(targetRef, setValue, finalTranscript);
            }
            setInterimTranscript(interim);
        };

        recognitionRef.current = recognition;
        setSupported(true);

        return () => {
            recognition.stop();
        };
    }, [lang, setValue, targetRef]);

    function start() {
        if (!recognitionRef.current || listening) return;
        setError(null);
        setInterimTranscript("");
        try {
            recognitionRef.current.lang = lang || window.navigator?.language || "en-US";
            recognitionRef.current.start();
        } catch (err: any) {
            setError(err?.message || "Unable to start dictation");
        }
    }

    function stop() {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
    }

    function toggle() {
        if (listening) {
            stop();
        } else {
            start();
        }
    }

    return { supported, listening, interimTranscript, error, start, stop, toggle };
}

function insertAtCursor(
    targetRef: React.RefObject<HTMLTextAreaElement | null>,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    text: string,
) {
    setValue((prev) => {
        const target = targetRef.current;
        if (target && typeof target.selectionStart === "number" && typeof target.selectionEnd === "number") {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const next = prev.slice(0, start) + text + prev.slice(end);
            const nextCaret = start + text.length;
            requestAnimationFrame(() => {
                target.selectionStart = nextCaret;
                target.selectionEnd = nextCaret;
            });
            return next;
        }
        return prev + text;
    });
}
