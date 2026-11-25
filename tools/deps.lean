/-
Dependency graph of a declaration closure, for scheduling kernel checks smallest-first.

  lake env lean --run deps.lean MODULE OUT.tsv DECL...

Writes one line per constant in the closure of DECL...:  name <TAB> kind <TAB> dep dep ...
Inductive blocks are treated as units, as lean4export exports them: a type, its
constructors and its recursors depend on each other's dependencies.
-/
import Lean
open Lean

def kindOf : ConstantInfo → String
  | .axiomInfo _ => "axiom" | .defnInfo _ => "def" | .thmInfo _ => "thm"
  | .opaqueInfo _ => "opaque" | .quotInfo _ => "quot" | .inductInfo _ => "induct"
  | .ctorInfo _ => "ctor" | .recInfo _ => "rec"

/-- Other members of the inductive block a constant belongs to. -/
def blockOf (env : Environment) : ConstantInfo → Array Name
  | .inductInfo v => blockOfInduct env v.all
  | .ctorInfo v => match env.find? v.induct with
    | some (.inductInfo i) => blockOfInduct env i.all | _ => #[]
  | .recInfo v => blockOfInduct env v.all
  | _ => #[]
where blockOfInduct (env : Environment) (all : List Name) : Array Name := Id.run do
  let mut out := #[]
  for t in all do
    out := out.push t
    if let some (.inductInfo i) := env.find? t then
      out := out ++ i.ctors.toArray
      out := out.push (mkRecName t)
  return out

def main (args : List String) : IO Unit := do
  let module :: outPath :: decls := args | throw <| IO.userError "usage: MODULE OUT.tsv DECL..."
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := module.toName }] {}
  let h ← IO.FS.Handle.mk outPath .write
  let mut seen : NameHashSet := {}
  let mut todo := decls.map String.toName |>.toArray
  repeat
    let some c := todo.back? | break
    todo := todo.pop
    if seen.contains c then continue
    seen := seen.insert c
    let some info := env.find? c | throw <| IO.userError s!"unknown constant {c}"
    let deps := (info.getUsedConstantsAsSet.toArray ++ blockOf env info).filter (· != c)
    h.putStrLn s!"{c}\t{kindOf info}\t{" ".intercalate (deps.map toString).toList}"
    todo := todo ++ deps.filter (!seen.contains ·)
  IO.eprintln s!"{seen.size} constants"
