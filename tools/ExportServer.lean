/-
  Build: copy into a lean4export checkout (built with this Lean version) and add to its
  lakefile.toml:  [[lean_exe]] name = "exportserver" root = "ExportServer"; then `lake build exportserver`.
Persistent exporter: load the environment once, then export batches on demand.

  lake env exportserver MODULE  < batches

Each stdin line is a space-separated list of constant names; the server writes the
NDJSON needed for them that it has not written before (names, levels, expressions and
declarations already exported are skipped, so numbering is global across batches),
then a line {"batchEnd":N}. An empty line or EOF ends the session.
-/
import Export
open Lean

def main (args : List String) : IO Unit := do
  initSearchPath (← findSysroot)
  let [mod] := args | throw <| IO.userError "usage: exportserver MODULE"
  let env ← importModules #[{ module := Syntax.decodeNameLit ("`" ++ mod) |>.get! }] {}
  let stdin ← IO.getStdin
  let stdout ← IO.getStdout
  M.run env do
    let _ ← initState env []
    dumpMetadata
    IO.println "{\"ready\":true}"
    stdout.flush
    let mut n := 0
    repeat
      let raw ← stdin.getLine
      let line : String := (raw.replace "\n" "").replace "\r" ""
      if line.isEmpty then break
      for c in line.splitOn " " do
        if c.isEmpty then continue
        let some name := Syntax.decodeNameLit ("`" ++ c) | throw <| IO.userError s!"bad name {c}"
        modify (fun st => { st with noMDataExprs := {} })
        dumpConstant name
      IO.println s!"\{\"batchEnd\":{n}}"
      stdout.flush
      n := n + 1
