module fa (cin, a, b, s, cout);
    input cin, a, b;
    output s, cout;

    assign s = a ^ b ^ cin;
    assign cout = (a & b) | (cin & (a ^ b));
endmodule

module adder_8bit (a, b, cin, s, cout);
    input [7:0] a, b;
    input cin;
    output [7:0] s;
    output cout;

    wire [6:0] c;

    fa fa0 (.a(a[0]), .b(b[0]), .cin(cin), .s(s[0]), .cout(c[0]));
    fa fa1 (.a(a[1]), .b(b[1]), .cin(c[0]), .s(s[1]), .cout(c[1]));
    fa fa2 (.a(a[2]), .b(b[2]), .cin(c[1]), .s(s[2]), .cout(c[2]));
    fa fa3 (.a(a[3]), .b(b[3]), .cin(c[2]), .s(s[3]), .cout(c[3]));
    fa fa4 (.a(a[4]), .b(b[4]), .cin(c[3]), .s(s[4]), .cout(c[4]));
    fa fa5 (.a(a[5]), .b(b[5]), .cin(c[4]), .s(s[5]), .cout(c[5]));
    fa fa6 (.a(a[6]), .b(b[6]), .cin(c[5]), .s(s[6]), .cout(c[6]));
    fa fa7 (.a(a[7]), .b(b[7]), .cin(c[6]), .s(s[7]), .cout(cout));
endmodule

module add_sub_8bit (a,b,sub,s,cout,overflow);
    input [7:0] a, b;
    input sub;
    output [7:0] s;
    output cout, overflow;

    wire [7:0] b_xor_sub;

    assign b_xor_sub = b ^ {8{sub}};
    adder_8bit adder (.a(a), .b(b_xor_sub), .cin(sub), .s(s), .cout(cout));
    assign overflow = ~(a[7] ^ b_xor_sub[7]) & (a[7] ^ s[7]);
endmodule

module shifter_8bit (a, mul2, div2);
    input [7:0] a;
    output [7:0] mul2, div2;

    assign mul2 = {a[6:0], 1'b0};
    assign div2 = {a[7], a[7:1]};
endmodule

module abs_8bit (a, abs_a);
    input [7:0] a;
    output [7:0] abs_a;

    wire [7:0] a_xor_sign;
    wire       unused_cout;

    assign a_xor_sign = a ^ {8{a[7]}};
    adder_8bit adder (.a(a_xor_sign), .b(8'b0), .cin(a[7]), .s(abs_a), .cout(unused_cout));
endmodule

module comparator_8bit (x, y, eq, gt);
    input [7:0] x, y;
    output eq, gt;

    wire [7:0] same;
    wire [8:0] g;

    xnor same_bits [7:0] (same, x, y);
    and  all_same (eq, same[0], same[1], same[2], same[3],
                       same[4], same[5], same[6], same[7]);

    assign g[0] = 1'b0;
    assign g[1] = (x[0] & ~y[0]) | (same[0] & g[0]);
    assign g[2] = (x[1] & ~y[1]) | (same[1] & g[1]);
    assign g[3] = (x[2] & ~y[2]) | (same[2] & g[2]);
    assign g[4] = (x[3] & ~y[3]) | (same[3] & g[3]);
    assign g[5] = (x[4] & ~y[4]) | (same[4] & g[4]);
    assign g[6] = (x[5] & ~y[5]) | (same[5] & g[5]);
    assign g[7] = (x[6] & ~y[6]) | (same[6] & g[6]);
    assign g[8] = (x[7] & ~y[7]) | (same[7] & g[7]);
    assign gt = g[8];
endmodule

module parity_8bit (a, even, odd);
    input [7:0] a;
    output even, odd;

    xor all_bits (odd, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
    assign even = ~odd;
endmodule

module ula_8bit (
    input [7:0] A,
    input [7:0] B,
    input [1:0] opcode,
    output [7:0] result,
    output carry_out,
    output overflow,
    output A_equal_B,
    output A_not_equal_B,
    output A_greater_B,
    output A_greater_equal_B,
    output A_less_B,
    output A_less_equal_B,
    output even_parity,
    output odd_parity
);
    wire [7:0] sum, mul2, div2, abs_a, abs_b;
    wire add_sub_cout, add_sub_overflow, eq, gt;

    add_sub_8bit add_sub (.a(A), .b(B), .sub(opcode[0]), .s(sum),
                          .cout(add_sub_cout), .overflow(add_sub_overflow));
    shifter_8bit shifter (.a(A), .mul2(mul2), .div2(div2));

    assign result = (opcode == 2'b00) ? sum :
                    (opcode == 2'b01) ? sum :
                    (opcode == 2'b10) ? mul2 : div2;

    assign carry_out = (opcode == 2'b00) ? add_sub_cout :
                       (opcode == 2'b01) ? add_sub_cout : 1'b0;
    assign overflow  = (opcode == 2'b00) ? add_sub_overflow :
                       (opcode == 2'b01) ? add_sub_overflow : 1'b0;

    abs_8bit abs_of_a (.a(A), .abs_a(abs_a));
    abs_8bit abs_of_b (.a(B), .abs_a(abs_b));
    comparator_8bit comparator (.x(abs_a), .y(abs_b), .eq(eq), .gt(gt));

    assign A_equal_B         = eq;
    assign A_not_equal_B     = ~eq;
    assign A_greater_B       = gt;
    assign A_greater_equal_B = gt | eq;
    assign A_less_B          = ~(gt | eq);
    assign A_less_equal_B    = ~gt;

    parity_8bit parity (.a(A), .even(even_parity), .odd(odd_parity));
endmodule
