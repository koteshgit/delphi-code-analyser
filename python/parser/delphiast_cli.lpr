program delphiast_cli;

{$MODE Delphi}
{$H+}

uses
  SysUtils, Classes,
  SimpleParser.Lexer.Types,
  DelphiAST, DelphiAST.Classes, DelphiAST.Writer;

var
  InputFile: string;
  Builder: TPasSyntaxTreeBuilder;
  SyntaxTree: TSyntaxNode;
  SourceStream: TMemoryStream;
  SL: TStringList;
  Content: string;
  XMLOutput: string;
begin
  if ParamCount < 1 then
  begin
    WriteLn(StdErr, 'Usage: delphiast_cli <input_file>');
    Halt(1);
  end;

  InputFile := ParamStr(1);

  if not FileExists(InputFile) then
  begin
    WriteLn(StdErr, 'File not found: ' + InputFile);
    Halt(1);
  end;

  try
    SL := TStringList.Create;
    try
      SL.LoadFromFile(InputFile);
      Content := SL.Text;
    finally
      SL.Free;
    end;

    SourceStream := TMemoryStream.Create;
    try
      if Length(Content) > 0 then
        SourceStream.Write(Content[1], Length(Content));
      SourceStream.Position := 0;

      Builder := TPasSyntaxTreeBuilder.Create;
      try
        Builder.InitDefinesDefinedByCompiler;
        SyntaxTree := Builder.Run(SourceStream);
        try
          XMLOutput := TSyntaxTreeWriter.ToXML(SyntaxTree, True);
          WriteLn(XMLOutput);
        finally
          SyntaxTree.Free;
        end;
      finally
        Builder.Free;
      end;
    finally
      SourceStream.Free;
    end;
  except
    on E: ESyntaxTreeException do
    begin
      WriteLn(StdErr, 'Parse error at line ' + IntToStr(E.Line) + ', col ' + IntToStr(E.Col) + ': ' + E.Message);
      if Assigned(E.SyntaxTree) then
      begin
        XMLOutput := TSyntaxTreeWriter.ToXML(E.SyntaxTree, True);
        WriteLn(XMLOutput);
      end;
      Halt(2);
    end;
    on E: Exception do
    begin
      WriteLn(StdErr, 'Error: ' + E.ClassName + ': ' + E.Message);
      Halt(1);
    end;
  end;
end.
