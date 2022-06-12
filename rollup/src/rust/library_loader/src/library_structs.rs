use std::io::{BufRead, Write};
use nonmax::NonMaxU16;

use crate::bin_io::{Serialize, SerializeIter, SerializeIterContainer, VecSyncReadIter, VecIterReadIter};

#[repr(u8)]
pub enum SongMode {
	Bytebeat = 0x10,
	SignedBytebeat = 0x20,
	Floatbeat = 0x30,
	Funcbeat = 0x40,
}

struct FileCategories(u8);
mod file_categories {
	pub const ORIGINAL: u8 = 0x01;
	pub const MINIFIED: u8 = 0x02;
	pub const OPTIMIZED: u8 = 0x04;
	pub const FORMATTED: u8 = 0x08;
}

pub struct LibraryEntry {
	pub description: String, // empty means none
	pub url: String, // empty means none
	pub authors: Vec<String>,
	pub remix_of: Option<NonMaxU16>, // NonMaxU16 is a good enough usize for a playlist
	pub date: Option<chrono::naive::NaiveDate>,
	pub sample_rate: f64,
	pub mode_and_files: u8, // SongMode and FileCategory
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	pub children: Vec<LibraryEntry>,
}
impl Serialize for LibraryEntry {
	fn write(&self, writer: &mut impl Write) {
		self.description.write(writer);
		self.url.write(writer);
		self.authors.write(writer);
		self.remix_of.map_or(u16::MAX, |x| x.get()).write(writer);
		self.date.write(writer);
		self.sample_rate.write(writer);
		self.mode_and_files.write(writer);
		self.code_original.write(writer);
		self.code_minified.write(writer);
		self.children.write(writer);
	}
	fn read(reader: &mut impl BufRead) -> Self {
		LibraryEntry {
			description: String::read(reader),
			url: String::read(reader),
			authors: Vec::<String>::read(reader),
			remix_of: NonMaxU16::new(u16::read(reader)),
			date: Option::<chrono::naive::NaiveDate>::read(reader),
			sample_rate: f64::read(reader),
			mode_and_files: u8::read(reader),
			code_original: String::read(reader),
			code_minified: String::read(reader),
			children: Vec::<LibraryEntry>::read(reader),
		}
	}
}
pub struct LibraryEntryIter<R: BufRead> {
	pub description: String, // empty means none
	pub url: String, // empty means none
	pub authors: Vec<String>,
	pub remix_of: Option<NonMaxU16>, // NonMaxU16 is a good enough usize for a playlist
	pub date: Option<chrono::naive::NaiveDate>,
	pub sample_rate: f64,
	pub mode_and_files: u8, // SongMode and FileCategory
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	children: VecIterReadIter<LibraryEntry, R>,
}
impl<R: BufRead> LibraryEntryIter<R> {
	pub fn read(mut reader: R) -> Self {
		LibraryEntryIter {
			description: String::read(&mut reader),
			url: String::read(&mut reader),
			authors: Vec::<String>::read(&mut reader),
			remix_of: NonMaxU16::new(u16::read(&mut reader)),
			date: Option::<chrono::naive::NaiveDate>::read(&mut reader),
			sample_rate: f64::read(&mut reader),
			mode_and_files: u8::read(&mut reader),
			code_original: String::read(&mut reader),
			code_minified: String::read(&mut reader),
			children: VecReadIter::<LibraryEntry, R>::start(reader),
		}
	}
}

pub struct Playlist {
	pub name: String,
	pub content: Vec<LibraryEntry>,
}
impl Serialize for Playlist {
	fn write(&self, writer: &mut impl Write) {
		self.name.write(writer);
		self.content.write(writer);
	}
	fn read(reader: &mut impl BufRead) -> Self {
		Playlist {
			name: String::read(reader),
			content: Vec::<LibraryEntry>::read(reader),
		}
	}
}
struct PlaylistIter<R: BufRead> {
	pub name: String,
	content: VecIterReadIter<LibraryEntry, R>,
}
trait SerializeIterContainer: Sized {
	type Sync: SerializeSync;

	fn start_read(reader: &mut impl BufRead) -> Self;
	fn collect(self, reader: &mut impl BufRead) -> Self::Sync;
}
impl<R: BufRead> PlaylistIter<R> {
	pub fn read(mut reader: R) -> Self {
		PlaylistIter {
			name: String::read(&mut reader),
			content: VecReadIter::<LibraryEntry, R>::start(reader),
		}
	}
}
