`timescale 1ns/1ps

module tb_add_sub_8bit;
  reg  [7:0] a, b;
  reg        sub;
  wire [7:0] s;
  wire       cout, overflow;

  reg  [7:0] b_inv;
  reg  [8:0] expected;
  reg        expected_ovf;
  integer    sa, sb, r;
  integer    i, errors;

  localparam N_CASES = 131072;

  add_sub_8bit UUT (.a(a), .b(b), .sub(sub), .s(s), .cout(cout), .overflow(overflow));

  initial begin
    $dumpfile("tb_add_sub_8bit.vcd");
    $dumpvars(0, tb_add_sub_8bit);
    errors = 0;

    for (i = 0; i < N_CASES; i = i + 1) begin
      {a, b, sub} = i;
      #10;

      b_inv = ~b;
      if (sub) expected = a + b_inv + 1;
      else     expected = a + b;

      sa = a; if (a[7]) sa = sa - 256;
      sb = b; if (b[7]) sb = sb - 256;
      if (sub) r = sa - sb; else r = sa + sb;
      expected_ovf = (r > 127) || (r < -128);

      if ({cout, s} !== expected) begin
        $display("Erro em {cout,s}: a=%0d b=%0d sub=%b | obtido %b_%b, esperado %b_%b",
                 sa, sb, sub, cout, s, expected[8], expected[7:0]);
        errors = errors + 1;
      end
      if (overflow !== expected_ovf) begin
        $display("Erro em overflow: a=%0d b=%0d sub=%b | obtido %b, esperado %b",
                 sa, sb, sub, overflow, expected_ovf);
        errors = errors + 1;
      end
    end

    if (errors == 0) $display("PASSOU: %0d casos", N_CASES);
    else             $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
