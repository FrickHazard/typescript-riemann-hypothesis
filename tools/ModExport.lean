/-
Per-module, resumable, parallel export of a proof's declaration closure.

  lake env modexport ROOT_MODULE NAMES.txt OUTDIR SHARD NSHARDS [THREADS]

NAMES.txt lists the constants to export, one per line, as `Name.toString` prints them
(the first column of tools/deps.lean output). They are grouped by the module that
declares them; this worker handles the modules whose index is SHARD mod NSHARDS and writes
OUTDIR/<Module>.ndjson for each, a self-contained lean4export file containing only that
module's declarations (constants of other modules stay references by name).

  - Resumable: a module whose file exists is skipped; files are written to a temporary
    name and renamed when complete, so an interrupted run never leaves a partial file.
  - Bounded memory and locality: the exporter's tables are fresh for every module, and a
    module's terms all live in its own .olean, read once.
  - Parallel: THREADS threads in one process share one loaded environment (loading it
    is the expensive part, minutes for the RH closure); NSHARDS processes with
    SHARD = 0..NSHARDS-1 also work (the .olean files are memory-mapped and shared).

Needs lean4export's `exportOnly` state field (see the recipe in README.md).

Build: copy into a lean4export checkout and add to its lakefile.toml
  [[lean_exe]] name = "modexport" root = "ModExport"
-/
import Export
import Std.Data.HashMap
open Lean

def main (args : List String) : IO Unit := do
  let (root, namesPath, outDir, shardS, nShardsS, threadsS) ← match args with
    | [r, n, o, s, k] => pure (r, n, o, s, k, "1")
    | [r, n, o, s, k, t] => pure (r, n, o, s, k, t)
    | _ => throw <| IO.userError "usage: modexport ROOT NAMES.txt OUTDIR SHARD NSHARDS [THREADS]"
  let some threads := threadsS.toNat? | throw <| IO.userError "bad THREADS"
  let some shard := shardS.toNat? | throw <| IO.userError "bad SHARD"
  let some nShards := nShardsS.toNat? | throw <| IO.userError "bad NSHARDS"
  initSearchPath (← findSysroot)
  let t0 ← IO.monoMsNow
  let env ← importModules #[{ module := Syntax.decodeNameLit ("`" ++ root) |>.get! }] {}
  -- Printed name -> constant (printed names do not always parse back).
  let mut table : Std.HashMap String Name := {}
  for (n, _) in env.constants.toList do
    table := table.insert n.toString n
  -- Group the requested constants by declaring module.
  let mut byModule : Std.HashMap Nat NameSet := {}
  let mut missing := 0
  for line in (← IO.FS.lines namesPath) do
    if line.isEmpty then continue
    let some n := table[line]? | do missing := missing + 1; continue
    let some idx := env.getModuleIdxFor? n | do missing := missing + 1; continue
    byModule := byModule.insert idx.toNat ((byModule.getD idx.toNat {}).insert n)
  let modNames := env.header.moduleNames
  let mine := (byModule.toArray.filter (·.1 % nShards == shard)).qsort (·.1 < ·.1)
  IO.FS.createDirAll outDir
  IO.eprintln s!"shard {shard}/{nShards}: env loaded in {(← IO.monoMsNow) - t0} ms; {byModule.size} modules, {mine.size} mine; {missing} names not found"
  -- The recursor map is the same for every module: compute it once.
  let template ← M.run env do
    let _ ← initState env []
    get
  -- Export one module; returns true if it was written, false if already present.
  let exportOne (tid : Nat) (idx : Nat) (consts : NameSet) : IO Bool := do
    let modName := modNames[idx]!
    let path := s!"{outDir}/{modName}.ndjson"
    if ← System.FilePath.pathExists path then return false
    let tmp := s!"{path}.tmp{shard}.{tid}"
    let h ← IO.FS.Handle.mk tmp .write
    let old ← IO.setStdout (IO.FS.Stream.ofHandle h)   -- per thread
    try
      M.run env do
        set { template with exportOnly := some consts }
        dumpMetadata
        for c in consts.toList do
          modify (fun st => { st with noMDataExprs := {} })
          dumpConstant c
    finally
      let _ ← IO.setStdout old
    h.flush
    IO.FS.rename tmp path
    return true
  let counter ← IO.mkRef (0 : Nat)
  let skippedRef ← IO.mkRef (0 : Nat)
  let workers ← (List.range threads).mapM fun tid => IO.asTask (prio := .dedicated) do
    let mut i := tid
    while i < mine.size do
      let (idx, consts) := mine[i]!
      if ← exportOne tid idx consts then
        let n ← counter.modifyGet fun n => (n + 1, n + 1)
        if n % 1000 == 0 then
          IO.eprintln s!"shard {shard}: {n} written, {← skippedRef.get} skipped of {mine.size}, {((← IO.monoMsNow) - t0) / 1000} s"
      else skippedRef.modify (· + 1)
      i := i + threads
  for w in workers do
    match ← IO.wait w with
    | .ok _ => pure ()
    | .error e => throw e
  let done ← counter.get
  let skipped ← skippedRef.get
  IO.eprintln s!"shard {shard}: finished {done} modules, skipped {skipped}, {((← IO.monoMsNow) - t0) / 1000} s"
