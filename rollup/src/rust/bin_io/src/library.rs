use std::io::BufRead;
use std::num::NonZeroU8;
use nonmax::NonMaxU16;
use num_enum::{IntoPrimitive, TryFromPrimitive};
#[cfg(feature = "write")]
use std::io::Write;

use crate::base::VecIterReadIter;
use crate::traits::*;

// { year: u12 (0-4096), month: u4 (1-12), day: u5 (1-31) }
// total size should be 4 bytes even in Option
#[derive(PartialEq, Eq, PartialOrd, Ord, Debug, Clone, Copy)]
pub struct Date {
	year: u16,
	month: NonZeroU8,
	day: NonZeroU8,
}
impl Date {
	pub fn new(year: u16, month: NonZeroU8, day: NonZeroU8) -> Self {
		if year > 0xfff { panic!("invalid year"); }
		if month.get() > 12 { panic!("invalid month"); }
		if day.get() > 31 { panic!("invalid day"); }
		Date { year, month, day }
	}
	// constant new
	pub fn cnew(year: u16, month: u8, day: u8) -> Self {
		Self::new(year, NonZeroU8::new(month).expect("invalid month"), NonZeroU8::new(day).expect("invalid day"))
	}
	pub fn year(&self) -> u16 { self.year }
	pub fn month(&self) -> NonZeroU8 { self.month }
	pub fn day(&self) -> NonZeroU8 { self.day }
	pub fn tuple(&self) -> (u16, NonZeroU8, NonZeroU8) { (self.year, self.month, self.day) }
}
#[cfg(feature = "write")]
impl SerializeWrite for Option<Date> {
	fn write(&self, writer: &mut impl Write) {
		if let Some(date) = self {
			((date.year << 4) | (date.month.get() as u16)).write(writer);
			date.day.get().write(writer);
		} else {
			[0_u8; 3].write(writer);
		}
	}
}
impl SerializeSync for Option<Date> {
	fn read(reader: &mut impl BufRead) -> Self {
		let ym = u16::read(reader);
		let maybe_day = u8::read(reader);

		Some(Date {
			year: ym >> 4,
			month: NonZeroU8::new((ym & 0xf) as u8)?,
			day: NonZeroU8::new(maybe_day)?,
		})
	}
}


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


// TODO: replace all cases of String with CString, the utf-8 checks take a large amount of space
pub struct LibraryEntry {
	pub description: String, // empty means none
	pub url: String, // empty means none
	pub authors: Vec<String>,
	pub remix_of: Option<NonMaxU16>, // NonMaxU16 is a good enough usize for a playlist
	pub date: Option<Date>,
	pub sample_rate: f64,
	pub song_mode: SongMode,
	pub file_categories: FileCategories,
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	pub children: Vec<LibraryEntry>,
}
#[cfg(feature = "write")]
impl SerializeWrite for LibraryEntry {
	fn write(&self, writer: &mut impl Write) {
		self.description.write(writer);
		self.url.write(writer);
		self.authors.write(writer);
		self.remix_of.map_or(u16::MAX, |x| x.get()).write(writer);
		self.date.write(writer);
		self.sample_rate.write(writer);
		(u8::from(self.song_mode) & self.file_categories.0).write(writer);
		self.code_original.write(writer);
		self.code_minified.write(writer);
		self.children.write(writer);
	}
}
impl SerializeSync for LibraryEntry {
	fn read(reader: &mut impl BufRead) -> Self {
		let file_categories;
		LibraryEntry {
			description: String::read(reader),
			url: String::read(reader),
			authors: Vec::<String>::read(reader),
			remix_of: NonMaxU16::new(u16::read(reader)),
			date: Option::<Date>::read(reader),
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
	pub date: Option<Date>,
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
			date: Option::<Date>::read(reader),
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
			date: self.date,
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
#[cfg(feature = "write")]
impl SerializeWrite for Playlist {
	fn write(&self, writer: &mut impl Write) {
		self.name.write(writer);
		self.content.write(writer);
	}
}
impl SerializeSync for Playlist {
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
