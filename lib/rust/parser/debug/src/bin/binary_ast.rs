//! Run the parser from the command line, and output the raw binary serialization of the AST for
//! debugging.

use std::io::Write;



fn main() {
    use std::io::Read;
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let mut code = input.as_str();
    if let Some((_meta, code_)) = enso_parser::metadata::parse(code) {
        code = code_;
    }
    let ast = enso_parser::Parser::new().parse_module(code);
    let data =
        enso_parser::format::serialize(&ast).expect("Failed to serialize AST to binary format");
    std::io::stdout().write_all(&data).unwrap();
}
