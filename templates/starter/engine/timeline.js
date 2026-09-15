import {clamp} from './math.js';
export function progressAtTime(seconds,secondsPerChapter,chapterCount){return clamp(seconds/secondsPerChapter,0,chapterCount);}
export function timeAtProgress(progress,secondsPerChapter,chapterCount){return clamp(progress,0,chapterCount)*secondsPerChapter;}
export function formatTime(value){const seconds=Math.max(0,Math.floor(value));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
