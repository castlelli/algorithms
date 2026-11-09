`timescale 1ns/1ps

module tb_comparator_8bit;
  reg  [7:0] x, y;
  wire       eq, gt;

  reg        expected_eq, expected_gt;
  integer    i, errors;

  localparam N_CASES = 65536;

  comparator_8bit UUT (.x(x), .y(y), .eq(eq), .gt(gt));

  initial begin
    $dumpfile("tb_comparator_8bit.vcd");
    $dumpvars(0, tb_comparator_8bit);
    errors = 0;

    for (i = 0; i < N_CASES; i = i + 1) begin
      {x, y} = i;
      #10;

      expected_eq = (x == y);
      expected_gt = (x > y);

      if (eq !== expected_eq || gt !== expected_gt) begin
        $display("Erro: x=%0d y=%0d | obtido eq=%b gt=%b, esperado eq=%b gt=%b",
                 x, y, eq, gt, expected_eq, expected_gt);
        errors = errors + 1;
      end
    end

    if (errors == 0) $display("PASSOU: %0d casos", N_CASES);
    else             $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
