max(0, min(255, 128 + 100 * ((round(
  max(-1, min(1, sin(
    t * 0.07444 / ((round(t / 48000 + 3 + 4) % 48 > 39 ? 1 : 2) * (round(t / 48000 + 3 + 4) % 64 > 47 ? 1 : 0.5)) * pow(2, (int(max(0, min(7, round(abs((int(8 + t / 12000) % 16) - 8)) * 2 - 4 - (int(t / 12000) % 16 >= 5 && int(t / 12000) % 16 < 12)))) - 7) / 12)
  ) * 10 + (4.9 * sin(t / 14051)) * sin(t / 39004))) * (100 + 80 * sin(t / 20499))
) / (100 + 80 * sin(t / 20499)) * (
  int(t / 1500 - 0.5) % 8 > 5 || int(t / 12000 - 2) % 8 > (int(t / 48000 - 1) % 8 < 4 ? (int(t / 12000 - 2) % 8 == 6 ? 6 : 4) : 6) ?
  0.1 :
  t % 12000 > 6000 ?
  0.3 :
  0.6 + 0.1 * sin(t / 4190)
) + (0.25 + 0.12 * cos(t / 20000)) * round(
  max(-1, min(1, sin(
    t * 0.0743 / ((round(t / 48000 + 7) % 56 > 47 ? 1 : 2) * (round(t / 48000 + 7) % 80 > 55 ? 1 : 0.5)) * pow(2, (max(-1, min(4, (int((int(t / 12000 + 2) % 16 < 5) ? 0 : (round(abs((int(8 + t / 12000) % 16) - 8)) * 2 - 8))))) - 7) / 12)
  ) * 10 + (4.9 * sin(t / 24051)) * sin(t / 39504))) * (22 + 11 * sin(t / 21499)) * (int(t / 6000) % 4 == 1 ? 0.5 : 1)
) / (22 + 11 * sin(t / 21499))) * 0.6 + (t < 24000 ? 0.1 : 0.7 + 0.2 * sin(t / 12345)) * sin(
  max(-0.3, min(0.3,
    sin(
      t * 0.07444 / 4 * pow(2, (
        int(t / 24000 + 1) % 8 < 6 ?
        int(7 + 7 * sin((1547167 + (int(t / 6000) % 4)) * sin((1547167 + (int(t / 6000) % 4)) / 4129))) :
        int(5 + 6 * sin((4664 + (int(t / 6000) % 4)) * sin((4664 + (int(t / 6000) % 4)))))
      ) / 12 + (int(t / 6000) % 2))
    ) * (8 + 4 * sin(t / 25210)) + 3.7 * sin(t / 50040)
  )) + 1 * sin(t / 4191)
))))