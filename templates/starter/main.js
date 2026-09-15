import {LayeredWorld} from './engine/runtime.js';
const app=new LayeredWorld({configUrl:'config/world.json'});
app.mount().catch(error=>{console.error(error);document.getElementById('loading').textContent='The journey could not load. Check config/world.json and the console.';});
window.layeredWorld=app;
