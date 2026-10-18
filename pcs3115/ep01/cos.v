module fa (a, b, cin, s, cout);
input a, b, cin;
output s, cout;
assign s = a ^ b ^ cin;
assign cout = (a & b) | (cin & (a ^ b));
endmodule

module add4 (A, B, cin, S, cout);
input [3:0] A, B;
input cin;
output [3:0] S;
output cout;
wire c1, c2, c3;
fa f0 (A[0], B[0], cin, S[0], c1);
fa f1 (A[1], B[1], c1,  S[1], c2);
fa f2 (A[2], B[2], c2,  S[2], c3);
fa f3 (A[3], B[3], c3,  S[3], cout);
endmodule

module add8 (A, B, cin, S, cout);
input [7:0] A, B;
input cin;
output [7:0] S;
output cout;
wire c4;
add4 lo (A[3:0], B[3:0], cin, S[3:0], c4);
add4 hi (A[7:4], B[7:4], c4,  S[7:4], cout);
endmodule

module cos (x,y);
input [3:0] x;
output [7:0] y;

wire [3:0] a, pp0, pp1, pp2, pp3, s1, s2, s3;
wire ca, c1, c2, c3, cy;
wire [7:0] sq, half;

add4 u_abs (x ^ {4{x[3]}}, 4'b0000, x[3], a, ca);

assign pp0 = a & {4{a[0]}};
assign pp1 = a & {4{a[1]}};
assign pp2 = a & {4{a[2]}};
assign pp3 = a & {4{a[3]}};

add4 u_m1 (pp1, {1'b0, pp0[3:1]}, 1'b0, s1, c1);
add4 u_m2 (pp2, {c1, s1[3:1]},    1'b0, s2, c2);
add4 u_m3 (pp3, {c2, s2[3:1]},    1'b0, s3, c3);

assign sq = {c3, s3[3:1], s3[0], s2[0], s1[0], pp0[0]};
assign half = {1'b0, sq[7:1]};

add8 u_y (~half, 8'b0000_0010, 1'b0, y, cy);
endmodule
