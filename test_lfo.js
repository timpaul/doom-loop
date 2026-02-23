const D = 1;
for (let v = 0; v <= 1.0; v += 0.25) {
  let L = Math.max(0, v - v*D);
  let U = Math.min(1, v + v*D);
  console.log(`v=${v} => min=${L}, max=${U}`);
}
