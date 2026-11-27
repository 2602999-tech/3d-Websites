import * as THREE from 'three';

/**
 * Computes custom area-weighted vertex normals with a configurable crease angle
 * threshold (in radians) at high spatial precision (1e-5 units), avoiding the
 * coarse 1e-2 quantization collisions of BufferGeometryUtils.toCreasedNormals
 * on small radii such as cup rims, spouts, and machined collars.
 */
export function applySmoothVertexNormalsWithThreshold(
  geometry: THREE.BufferGeometry,
  angleThresholdRad = Math.PI / 3,
): THREE.BufferGeometry {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) {
    geometry.dispose();
  }

  // Baseline smooth normals as fallback for any degenerate pole triangles
  result.computeVertexNormals();

  const posAttr = result.attributes.position as THREE.BufferAttribute;
  const normAttr = result.attributes.normal as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const faceCount = Math.floor(vertexCount / 3);
  if (faceCount === 0) return result;

  const cosThreshold = Math.cos(angleThresholdRad);

  // Store area-weighted (raw cross) normals and unit face normals per triangle
  const weightedNormals = new Float64Array(faceCount * 3);
  const unitNormals = new Float64Array(faceCount * 3);
  const faceValid = new Uint8Array(faceCount);

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    const ax = posAttr.getX(i0);
    const ay = posAttr.getY(i0);
    const az = posAttr.getZ(i0);

    const bx = posAttr.getX(i1);
    const by = posAttr.getY(i1);
    const bz = posAttr.getZ(i1);

    const cx = posAttr.getX(i2);
    const cy = posAttr.getY(i2);
    const cz = posAttr.getZ(i2);

    const cbX = cx - bx;
    const cbY = cy - by;
    const cbZ = cz - bz;
    const abX = ax - bx;
    const abY = ay - by;
    const abZ = az - bz;

    const nx = cbY * abZ - cbZ * abY;
    const ny = cbZ * abX - cbX * abZ;
    const nz = cbX * abY - cbY * abX;

    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      faceValid[f] = 1;
      const f3 = f * 3;
      weightedNormals[f3] = nx;
      weightedNormals[f3 + 1] = ny;
      weightedNormals[f3 + 2] = nz;
      unitNormals[f3] = nx / len;
      unitNormals[f3 + 1] = ny / len;
      unitNormals[f3 + 2] = nz / len;
    }
  }

  // Group vertex indices by exact spatial position (1e-5 resolution welds 0..2pi seams cleanly)
  const SCALE = 1e5;
  const spatialMap = new Map<string, number[]>();
  for (let v = 0; v < vertexCount; v++) {
    const kx = Math.round(posAttr.getX(v) * SCALE);
    const ky = Math.round(posAttr.getY(v) * SCALE);
    const kz = Math.round(posAttr.getZ(v) * SCALE);
    const key = `${kx},${ky},${kz}`;
    let bucket = spatialMap.get(key);
    if (!bucket) {
      bucket = [v];
      spatialMap.set(key, bucket);
    } else {
      bucket.push(v);
    }
  }

  const outNormals = new Float32Array(vertexCount * 3);

  spatialMap.forEach((bucket) => {
    const count = bucket.length;
    for (let a = 0; a < count; a++) {
      const va = bucket[a];
      const fa = Math.floor(va / 3);
      const va3 = va * 3;

      if (!faceValid[fa]) {
        outNormals[va3] = normAttr.getX(va);
        outNormals[va3 + 1] = normAttr.getY(va);
        outNormals[va3 + 2] = normAttr.getZ(va);
        continue;
      }

      const fa3 = fa * 3;
      const ux = unitNormals[fa3];
      const uy = unitNormals[fa3 + 1];
      const uz = unitNormals[fa3 + 2];

      let sx = 0;
      let sy = 0;
      let sz = 0;

      for (let b = 0; b < count; b++) {
        const fb = Math.floor(bucket[b] / 3);
        if (!faceValid[fb]) continue;
        const fb3 = fb * 3;
        const dot = ux * unitNormals[fb3] + uy * unitNormals[fb3 + 1] + uz * unitNormals[fb3 + 2];
        if (dot >= cosThreshold) {
          sx += weightedNormals[fb3];
          sy += weightedNormals[fb3 + 1];
          sz += weightedNormals[fb3 + 2];
        }
      }

      const sLen = Math.hypot(sx, sy, sz);
      if (sLen > 1e-12) {
        outNormals[va3] = sx / sLen;
        outNormals[va3 + 1] = sy / sLen;
        outNormals[va3 + 2] = sz / sLen;
      } else {
        outNormals[va3] = normAttr.getX(va);
        outNormals[va3 + 1] = normAttr.getY(va);
        outNormals[va3 + 2] = normAttr.getZ(va);
      }
    }
  });

  result.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
  return result;
}
