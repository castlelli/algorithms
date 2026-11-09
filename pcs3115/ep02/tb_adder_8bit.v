`timescale 1ns/1ps

module tb_adder_8bit;
  reg  [7:0] a, b;
  reg  cin;
  wire [7:0] s;
  wire cout;
  reg  [8:0] expected;
  integer i, errors;
  localparam N = 131072;

  adder_8bit UUT (.a(a), .b(b), .cin(cin), .s(s), .cout(cout));

  initial begin
    $dumpfile("tb_adder_8bit.vcd");
    $dumpvars(0, tb_adder_8bit);
    errors = 0;

    for (i = 0; i < N; i = i + 1) begin
      {a, b, cin} = i;
      #10;
      expected = a + b + cin;
      if ({cout, s} !== expected) begin
        errors = errors + 1;
      end
    end

    if (errors == 0) $display("PASSOU");
    else            $display("FALHOU: %0d erro(s)", errors);
    $finish;
    end
endmodule
