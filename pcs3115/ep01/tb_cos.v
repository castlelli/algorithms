module tb_cos;
reg [3:0] x;
wire [7:0] y;
integer i, e, erros;

cos dut (x, y);

initial begin
  erros = 0;
  $display("x,y,esperado");
  for (i = -8; i < 8; i = i + 1) begin
    x = i[3:0];
    #10;
    e = 1 - (i*i)/2;
    if (y != e[7:0])
      erros = erros + 1;
    $display("%0d,%b,%0d", i, y, e);
  end
  if (erros == 0)
    $display("PASS");
  else
    $display("FAIL %0d", erros);
  $finish;
end
endmodule
