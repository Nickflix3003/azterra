import React, { useRef, useEffect } from 'react';

// Radiant Sun Burst Shader - Represents Kaya, God of Light and Control
const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_intensity; // Controls the burst intensity
uniform vec2 u_offset;    // Controls center position
out vec4 out_color;

void main() {
    // Apply offset to center point (positive y moves center up)
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy);
    p -= u_offset * min(u_resolution.x, u_resolution.y); 
    
    vec2 uv = p / min(u_resolution.x, u_resolution.y);
    float t = u_time * 0.3;
    
    // Distance from center
    float dist = length(uv);
    
    // Angle from center
    float angle = atan(uv.y, uv.x);
    
    // Create multiple rays
    float rays = 0.0;
    int numRays = 24;
    
    for(int i = 0; i < numRays; i++) {
        float rayAngle = float(i) * 6.28318 / float(numRays);
        float rayOffset = sin(t * 0.5 + float(i) * 0.3) * 0.1;
        
        // Calculate ray intensity
        float angleDiff = abs(mod(angle - rayAngle + rayOffset + 3.14159, 6.28318) - 3.14159);
        float rayWidth = 0.05 + sin(t + float(i)) * 0.02;
        float ray = smoothstep(rayWidth, 0.0, angleDiff);
        
        // Fade rays with distance
        ray *= smoothstep(2.0, 0.0, dist);
        
        // Pulsing effect
        ray *= 0.5 + 0.5 * sin(t * 2.0 - dist * 3.0 + float(i) * 0.5);
        
        rays += ray;
    }
    
    // RESTORED: Center glow (Soft and diffuse, not a "particle")
    float centerGlow = 1.0 / (1.0 + dist * 3.0); // Broader falloff
    centerGlow *= 0.6 + 0.1 * sin(t * 3.0);
    
    // Rotating energy rings - subtle
    float rings = 0.0;
    for(int i = 0; i < 5; i++) {
        float ringDist = 0.3 + float(i) * 0.15;
        float ringRotation = t * (0.5 + float(i) * 0.2);
        float ringPattern = sin(angle * 8.0 + ringRotation) * 0.5 + 0.5;
        float ring = smoothstep(0.02, 0.0, abs(dist - ringDist)) * ringPattern;
        ring *= smoothstep(1.5, 0.5, dist);
        rings += ring * 0.3;
    }
    
    // RESTORED: Sparkles (Orbiting particles)
    float sparkles = 0.0;
    for(int i = 0; i < 40; i++) {
        // Create orbiting sparkles
        float speed = 0.2 + float(i) * 0.05;
        float orbitRadius = 0.3 + float(i) * 0.03;
        float sparkleAngle = float(i) * 1.618 * 6.28 + t * speed * (mod(float(i), 2.0) * 2.0 - 1.0); // varied direction
        
        vec2 sparklePos = vec2(
            cos(sparkleAngle) * orbitRadius,
            sin(sparkleAngle) * orbitRadius
        );
        
        float sparkleDist = length(uv - sparklePos);
        float sparkleSize = 0.005 + 0.005 * sin(t * 5.0 + float(i)); // Dynamic pulsing size
        float sparkle = smoothstep(sparkleSize, 0.0, sparkleDist);
        
        sparkles += sparkle;
    }
    
    // Combine all elements
    float totalLight = rays * 0.6 + centerGlow * 0.8 + rings + sparkles * 0.5;
    totalLight *= u_intensity;
    
    // Azterra gold color palette
    vec3 goldColor = vec3(0.81, 0.67, 0.41); // #cfaa68
    vec3 lightGold = vec3(1.0, 0.84, 0.47);  // Lighter gold
    vec3 warmWhite = vec3(0.96, 0.90, 0.79); // #f5e5c9
    
    // Color gradient based on intensity
    vec3 color = mix(goldColor, lightGold, totalLight * 0.5);
    color = mix(color, warmWhite, totalLight * totalLight * 0.3);
    
    // Add some warmth
    color *= vec3(1.0, 0.95, 0.85);
    
    // Output with alpha based on intensity
    out_color = vec4(color * totalLight, totalLight * 0.6);
}
`;

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
}

function resizeCanvasToDisplaySize(canvas) {
    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
        return true;
    }
    return false;
}

export default function RadiantSunShader({ intensity = 0.5, centerOffset = [0, 0] }) {
    const canvasRef = useRef(null);
    const intensityRef = useRef(intensity);
    const offsetRef = useRef(centerOffset);

    useEffect(() => { intensityRef.current = intensity; }, [intensity]);
    useEffect(() => { offsetRef.current = centerOffset; }, [centerOffset]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl2', {
            antialias: true,
            alpha: true,
            premultipliedAlpha: false
        });
        if (!gl) {
            console.warn('WebGL2 not supported in this browser.');
            return;
        }

        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        if (!program) return;
        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

        const timeLocation = gl.getUniformLocation(program, 'u_time');
        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
        const intensityLocation = gl.getUniformLocation(program, 'u_intensity');
        const offsetLocation = gl.getUniformLocation(program, 'u_offset');

        let startTime = performance.now();
        let frameId;

        const render = (currentTime) => {
            const time = (currentTime - startTime) / 1000;
            resizeCanvasToDisplaySize(gl.canvas);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(timeLocation, time);
            gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
            gl.uniform1f(intensityLocation, intensityRef.current);
            gl.uniform2fv(offsetLocation, offsetRef.current);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            frameId = requestAnimationFrame(render);
        };

        frameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(frameId);
            gl.deleteBuffer(positionBuffer);
            gl.deleteProgram(program);
        };
    }, []);

    return <canvas ref={canvasRef} className="radiant-sun-shader" />;
}
