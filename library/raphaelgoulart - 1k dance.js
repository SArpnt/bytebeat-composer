z = 40.7,
b = t / 2250,
r = int(b),
y = r % 16,
a = [1, 2, 1, 2, 1.2, 2.4, 1.2, 2.4, 1.33, 2.67, 1.33, 2.67, 1.5, 3, 1.5, 3][y],
c = r % 64 > 1 && r % 64 < 33,
o = c ? 1.19 : 1.5,
n = [
  0, 0, 2.38, 2.67, 2.38, 0, 2, 2.24, 0, 2.38, 0, 2.24, 0, 1.78, 0, 2, 2, 2, 1, 1.19, 1.5, 0, 1.19, 1.33, 0,
  1.19, 0, c ? 1.12 : 1.33, 0, o, o, o
],
x = int(r / 4) % 4,
d = [12, 12, 10.67, 12][x],
g = [9.52, 9.52, 8, 8.96][x],
h = [8, 7.12, 6.72, 7.52][x],
v = (b * 2 % 4) * 1.25,
w = int(y / 12),
u = int(r / 16) % 4,
j = [
  [19.04, 17.92],
  [14.24, 9.52],
  [10.64, 12],
  [8, 0]
],
40 +
  sin(t * (1 / z) + sin(t * 1.125 / z) * 7 * (1 - b * 2 % 4 > 0 ? 1 - b * 2 % 4 : 0)) * (40 - b * 15 % 30) +
  (b < 16 ? 0 : random() * (r % 4 === 2 ? 32 - (b * 32 % 32) : 0)) +
  (b < 32 ? 0 : random() * (16 - (b * 28 % 28 < 16 ? b * 28 % 28 : 16))) +
  (b < 64 ? 0 : sin(t * a / z + sin(t * a / z) * 4 * (1 - b % 1)) * 32 + 32) +
  (b < 96 ? 0 : sin(t * d / z + sin(t * d / z) * (0 + (b * 1.5 % 3))) * v + 5) +
  (b < 96 ? 0 : sin(t * g / z + sin(t * g / z) * (0 + (b * 1.5 % 3))) * v + 5) +
  (b < 96 ? 0 : sin(t * h / z + sin(t * h / z) * (0 + (b * 1.5 % 3))) * v + 5) +
  (b < 128 ? 0 : t * n[r % 32] * 8 % 256 > 121 + abs(108 - (b * 56 % 224)) ? 20 : 0) +
  (b < 129 ? 0 : t * n[(r - 1) % 32] * 7.98 % 256 > 121 + abs(108 - (b * 56 % 224)) ? 7 : 0) +
  (b < 192 ? 0 : sin(
    t * j[u][w] / z + sin(t * j[u][w] * 2 / z) * 4 * (y < 2 || y >= 12 & y < 14 ? 1 - b / 2 % 1 : 0)
  ) * (5.3 - y / 3 % 4) + 5.3);
