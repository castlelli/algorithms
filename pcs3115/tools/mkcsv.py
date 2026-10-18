import math, sys
rows = [l.strip().split(",") for l in open(sys.argv[1]) if l.count(",") == 2 and not l.startswith("x")]
with open(sys.argv[2], "w") as f:
    f.write("x,y_circuito,maclaurin_exato,cos_x,erro_arredondamento,erro_truncamento\n")
    for xs, ys, _ in rows:
        x, y = int(xs), int(ys, 2) - 256 * (ys[0] == "1")
        m = 1 - x * x / 2
        c = math.cos(x)
        f.write(f"{x},{y:.4f},{m:.4f},{c:.4f},{y - m:.4f},{m - c:.4f}\n")
