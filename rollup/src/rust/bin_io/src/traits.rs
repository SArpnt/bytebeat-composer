use std::io::BufRead;
#[cfg(feature = "write")]
use std::io::Write;

pub trait SerializeIterContainer: Sized {
	type Sync: SerializeSync;

	fn start_read(reader: &mut impl BufRead) -> Self;
	fn collect(self, reader: &mut impl BufRead) -> Self::Sync;
}
pub trait SerializeIter: SerializeIterContainer {
	type Item;

	fn len(&self) -> usize;
	fn next(&mut self, reader: &mut impl BufRead) -> Option<Self::Item>;
	fn discard(mut self, reader: &mut impl BufRead) {
		while let Some(_) = self.next(reader) {}
	}
}
pub trait SerializeSync: Sized {
	fn read(reader: &mut impl BufRead) -> Self;
}
#[cfg(feature = "write")]
pub trait SerializeWrite {
	// write doesn't need to be fast because that's only done beforehand to create the files
	fn write(&self, writer: &mut impl Write);
}

