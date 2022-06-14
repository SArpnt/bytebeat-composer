use std::io::{BufRead, Write};
use nonmax::NonMaxU16;
use num_enum::{IntoPrimitive, TryFromPrimitive};

use bin_io::VecIterReadIter;
use bin_io::traits::*;

#[derive(IntoPrimitive, TryFromPrimitive, Clone, Copy)]
#[repr(u8)]
pub enum SongMode {
	Bytebeat = 0x10,
	SignedBytebeat = 0x20,
	Floatbeat = 0x30,
	Funcbeat = 0x40,
}

#[derive(Clone, Copy)]
#[repr(transparent)]
pub struct FileCategories(pub u8);
pub mod file_categories {
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
	//pub date: Option<chrono::naive::NaiveDate>,
	pub sample_rate: f64,
	pub song_mode: SongMode,
	pub file_categories: FileCategories,
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	pub children: Vec<LibraryEntry>,
}
impl SerializeSync for LibraryEntry {
	fn write(&self, writer: &mut impl Write) {
		self.description.write(writer);
		self.url.write(writer);
		self.authors.write(writer);
		self.remix_of.map_or(u16::MAX, |x| x.get()).write(writer);
	//	self.date.write(writer);
		self.sample_rate.write(writer);
		(u8::from(self.song_mode) & self.file_categories.0).write(writer);
		self.code_original.write(writer);
		self.code_minified.write(writer);
		self.children.write(writer);
	}
	fn read(reader: &mut impl BufRead) -> Self {
		let file_categories;
		LibraryEntry {
			description: String::read(reader),
			url: String::read(reader),
			authors: Vec::<String>::read(reader),
			remix_of: NonMaxU16::new(u16::read(reader)),
	//		date: Option::<chrono::naive::NaiveDate>::read(reader),
			sample_rate: f64::read(reader),
			song_mode: {
				let raw = u8::read(reader);
				file_categories = FileCategories(raw & 0x0F);
				SongMode::try_from(raw & 0xF0).expect("invalid song mode")
			},
			file_categories,
			code_original: String::read(reader),
			code_minified: String::read(reader),
			children: Vec::<LibraryEntry>::read(reader),
		}
	}
}
pub struct LibraryEntryIter {
	pub description: String, // empty means none
	pub url: String, // empty means none
	pub authors: Vec<String>,
	pub remix_of: Option<NonMaxU16>, // NonMaxU16 is a good enough usize for a playlist
	//pub date: Option<chrono::naive::NaiveDate>,
	pub sample_rate: f64,
	pub song_mode: SongMode,
	pub file_categories: FileCategories,
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	pub children: VecIterReadIter<LibraryEntryIter>,
}
impl SerializeIterContainer for LibraryEntryIter {
	type Sync = LibraryEntry;

	fn start_read(reader: &mut impl BufRead) -> Self {
		let file_categories;
		LibraryEntryIter {
			description: String::read(reader),
			url: String::read(reader),
			authors: Vec::<String>::read(reader),
			remix_of: NonMaxU16::new(u16::read(reader)),
	//		date: Option::<chrono::naive::NaiveDate>::read(reader),
			sample_rate: f64::read(reader),
			song_mode: {
				let raw = u8::read(reader);
				file_categories = FileCategories(raw & 0x0F);
				SongMode::try_from(raw & 0xF0).expect("invalid song mode")
			},
			file_categories,
			code_original: String::read(reader),
			code_minified: String::read(reader),
			children: VecIterReadIter::<LibraryEntryIter>::start_read(reader),
		}
	}
	fn collect(self, reader: &mut impl BufRead) -> Self::Sync {
		LibraryEntry {
			description: self.description,
			url: self.url,
			authors: self.authors,
			remix_of: self.remix_of,
	//		date: self.date,
			sample_rate: self.sample_rate,
			song_mode: self.song_mode,
			file_categories: self.file_categories,
			code_original: self.code_original,
			code_minified: self.code_minified,
			children: self.children.collect(reader),
		}
	}
}

pub struct Playlist {
	pub name: String,
	pub content: Vec<LibraryEntry>,
}
impl SerializeSync for Playlist {
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
pub struct PlaylistIter {
	pub name: String,
	pub content: VecIterReadIter<LibraryEntryIter>,
}
impl SerializeIterContainer for PlaylistIter {
	type Sync = Playlist;

	fn start_read(reader: &mut impl BufRead) -> Self {
		PlaylistIter {
			name: String::read(reader),
			content: VecIterReadIter::<LibraryEntryIter>::start_read(reader),
		}
	}
	fn collect(self, reader: &mut impl BufRead) -> Self::Sync {
		Playlist {
			name: self.name,
			content: self.content.collect(reader),
		}
	}
}
