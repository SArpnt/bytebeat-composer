/**
 * everything panics in every possible fail condition because everything relies on this loading
 * nothing would recover anyways so it's better to not deal with all sorts of useless error types
 */

pub mod traits;
pub mod base;
#[cfg(feature = "library")]
pub mod library;
#[cfg(feature = "write")]
#[cfg(test)]
mod tests;
