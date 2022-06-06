use std::io::{BufRead, Write};
use wasm_bindgen::prelude::*;
use nonmax::NonMaxU16;

mod bin_io {
	use std::io::{BufRead, Write};
	use std::ffi::CString;
	use std::mem::MaybeUninit;
	use std::marker::PhantomData;
	use std::iter::FusedIterator;
	use chrono::naive::NaiveDate;

	/**
	 * everything panics in every possible fail condition because everything relies on this loading
	 * nothing would recover anyways so it's better to not deal with all sorts of useless error types
	 */
	pub trait Serialize {
		fn write(&self, writer: &mut impl Write);
		fn read(reader: &mut impl BufRead) -> Self where Self: Sized;
	}
	impl<const L: usize> Serialize for [u8; L] {
		fn write(&self, writer: &mut impl Write) {
			writer.write_all(self).unwrap();
		}
		fn read(reader: &mut impl BufRead) -> Self {
			// safe because all possible bits are valid
			let mut buffer: [u8; L] = unsafe { MaybeUninit::uninit().assume_init() }; // TODO: is there a better way to write this?
			reader.read_exact(&mut buffer).unwrap();
			buffer
		}
	}
	macro_rules! integer_serial {
		($T:ident) => {
			impl Serialize for $T {
				fn write(&self, writer: &mut impl Write) {
					self.to_le_bytes().write(writer);
				}
				fn read(reader: &mut impl BufRead) -> Self {
					Self::from_le_bytes(<[u8; std::mem::size_of::<Self>()]>::read(reader))
				}
			}
		}
	}
	integer_serial!(u8);
	integer_serial!(u16);
	integer_serial!(u32);
	integer_serial!(u64);
	integer_serial!(u128);
	integer_serial!(i8);
	integer_serial!(i16);
	integer_serial!(i32);
	integer_serial!(i64);
	integer_serial!(i128);
	integer_serial!(f32);
	integer_serial!(f64);
	impl Serialize for CString {
		fn write(&self, writer: &mut impl Write) {
			writer.write_all(self.as_bytes_with_nul()).unwrap();
		}
		fn read(reader: &mut impl BufRead) -> Self {
			let mut buf = Vec::<u8>::default();
			reader.read_until(0, &mut buf).unwrap();
			if let Some(0) = buf.last() {
				// safe because it's impossible for nul to be in the middle of the buffer
				unsafe { CString::from_vec_with_nul_unchecked(buf) }
			} else {
				panic!("hit EOF before null terminator");
			}
		}
	}
	impl Serialize for String {
		fn write(&self, writer: &mut impl Write) {
			CString::new(self.clone()).unwrap().write(writer);
		}
		fn read(reader: &mut impl BufRead) -> Self {
			CString::read(reader).into_string().unwrap()
		}
	}
	impl<T: Serialize> Serialize for Vec<T> {
		fn write(&self, writer: &mut impl Write) {
			u16::try_from(self.len()).unwrap().write(writer);
			for x in self.iter() {
				x.write(writer);
			}
		}
		fn read(reader: &mut impl BufRead) -> Self {
			let len = u16::read(reader);
			let mut vec = Vec::with_capacity(len.into());
			for _ in 0..len {
				vec.push(T::read(reader));
			}
			vec
		}
	}
	impl Serialize for Option<NaiveDate> {
		// ordinal can be stored in 9 bits
		// negative years aren't needed and chrono uses i32 for years, so the sign bit is free
		// to save space, the extra high bit of the ordinal is stored in the year sign bit
		// ordinal = 0 is invalid, which is used to store None
		fn write(&self, writer: &mut impl Write) {
			use chrono::Datelike;

			if let Some(date) = self {
				let year: i32 = date.year();
				if year < 0 { panic!("date cannot be serialized"); }
				let ordinal: u32 = date.ordinal();

				let packed_year: u32 =
					year as u32 | // year
					(((ordinal & 0x100) << (7 + 8 + 8)) as u32); // ordinal high bit
				let packed_ordinal: u8 = ordinal as u8; // ordinal low byte

				packed_year.write(writer);
				packed_ordinal.write(writer);
			} else {
				0_u32.write(writer);
				0_u8.write(writer);
			}
		}
		fn read(reader: &mut impl BufRead) -> Self {
			let packed_year = i32::read(reader);
			let packed_ordinal = u8::read(reader);

			let year: i32 = packed_year & 0x7fffffff; // year
			let ordinal: u32 =
				(((packed_year >> (7 + 8 + 8)) & 0x0100) as u32) | // ordinal high bit
				(packed_ordinal as u32); // ordinal low byte

			NaiveDate::from_yo_opt(year, ordinal)
		}
	}

	pub trait SerializeIter<R: BufRead> {
		fn start(reader: R) -> Self where Self: Sized + Iterator;
		fn end(self) -> Result<R, Self> where Self: Sized;
	}

	#[derive(Debug)]
	pub struct VecReadIter<T: Serialize, R: BufRead> {
		reader: R,
		remaining: u16,
		content: PhantomData<T>,
	}
	impl<T: Serialize, R: BufRead> VecReadIter<T, R> {
		pub fn len_raw(&self) -> u16 { self.remaining }
	}
	impl<T: Serialize, R: BufRead> SerializeIter<R> for VecReadIter<T, R> {
		fn start(mut reader: R) -> Self {
			let remaining = u16::read(&mut reader);
			VecReadIter {
				reader,
				remaining,
				content: PhantomData,
			}
		}
		fn end(self) -> Result<R, Self> {
			if self.remaining == 0 {
				Ok(self.reader)
			} else {
				Err(self)
			}
		}
	}
	impl<T: Serialize, R: BufRead> Iterator for VecReadIter<T, R> {
		type Item = T;

		fn next(&mut self) -> Option<Self::Item> {
			if self.remaining > 0 {
				self.remaining -= 1;
				Some(T::read(&mut self.reader))
			} else {
				None
			}
		}
	}
	impl<T: Serialize, R: BufRead> FusedIterator for VecReadIter<T, R> {}
	impl<T: Serialize, R: BufRead> ExactSizeIterator for VecReadIter<T, R> {
		fn len(&self) -> usize {
			self.remaining.into()
		}
	}

	#[test]
	fn read_write_nums() {
		use std::io::{Read, BufReader};

		let mut buf = Vec::<u8>::new();

		(42 as u8).write(&mut buf);
		(42 as u16).write(&mut buf);
		(42 as u32).write(&mut buf);
		(42 as u64).write(&mut buf);
		(42 as u128).write(&mut buf);
		(-42 as i8).write(&mut buf);
		(-42 as i16).write(&mut buf);
		(-42 as i32).write(&mut buf);
		(-42 as i64).write(&mut buf);
		(-42 as i128).write(&mut buf);
		(-38.42 as f32).write(&mut buf);
		(-38.42 as f64).write(&mut buf);

		let mut bufreader = BufReader::new(buf.as_slice());

		assert_eq!(u8::read(&mut bufreader), 42_u8);
		assert_eq!(u16::read(&mut bufreader), 42_u16);
		assert_eq!(u32::read(&mut bufreader), 42_u32);
		assert_eq!(u64::read(&mut bufreader), 42_u64);
		assert_eq!(u128::read(&mut bufreader), 42_u128);
		assert_eq!(i8::read(&mut bufreader), -42_i8);
		assert_eq!(i16::read(&mut bufreader), -42_i16);
		assert_eq!(i32::read(&mut bufreader), -42_i32);
		assert_eq!(i64::read(&mut bufreader), -42_i64);
		assert_eq!(i128::read(&mut bufreader), -42_i128);
		assert_eq!(f32::read(&mut bufreader), -38.42_f32);
		assert_eq!(f64::read(&mut bufreader), -38.42_f64);

		let mut remaining = Vec::<u8>::new();
		assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
	}
	#[test]
	fn read_write_string() {
		use std::io::{Read, BufReader};

		let mut buf = Vec::<u8>::new();

		CString::new("cstring test ß").unwrap().write(&mut buf);
		String::from("rust string test ß").write(&mut buf);

		let mut bufreader = BufReader::new(buf.as_slice());

		assert_eq!(CString::read(&mut bufreader), CString::new("cstring test ß").unwrap());
		assert_eq!(String::read(&mut bufreader), String::from("rust string test ß"));

		let mut remaining = Vec::<u8>::new();
		assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
	}
	#[test]
	fn read_write_vecs() {
		use std::io::{Read, BufReader};

		let mut buf = Vec::<u8>::new();
		let mut buf2 = Vec::<u8>::new();

		{
			let c1 = vec![1_u16, 2_u16, 3_u16, 4_u16];
			let c2 = vec![String::from("one"), String::from("two"), String::from("three")];
			c1.write(&mut buf);
			c2.write(&mut buf);
			c1.write(&mut buf2);
			c2.write(&mut buf2);
		}

		let mut bufreader = BufReader::new(buf.as_slice());
		let mut bufreader2 = BufReader::new(buf2.as_slice());

		{
			let vec1 = Vec::<u16>::read(&mut bufreader);
			let vec2 = Vec::<String>::read(&mut bufreader);

			assert_eq!(vec1.len(), 4);
			assert_eq!(vec1[0], 1_u16);
			assert_eq!(vec1[1], 2_u16);
			assert_eq!(vec1[2], 3_u16);
			assert_eq!(vec1[3], 4_u16);
			assert_eq!(vec2.len(), 3);
			assert_eq!(vec2[0], String::from("one"));
			assert_eq!(vec2[1], String::from("two"));
			assert_eq!(vec2[2], String::from("three"));
		}

		assert_eq!(u16::read(&mut bufreader2), 4_u16);
		assert_eq!(u16::read(&mut bufreader2), 1_u16);
		assert_eq!(u16::read(&mut bufreader2), 2_u16);
		assert_eq!(u16::read(&mut bufreader2), 3_u16);
		assert_eq!(u16::read(&mut bufreader2), 4_u16);
		assert_eq!(u16::read(&mut bufreader2), 3_u16);
		assert_eq!(String::read(&mut bufreader2), String::from("one"));
		assert_eq!(String::read(&mut bufreader2), String::from("two"));
		assert_eq!(String::read(&mut bufreader2), String::from("three"));

		let mut remaining = Vec::<u8>::new();
		assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
		assert_eq!(bufreader2.read_to_end(&mut remaining).unwrap(), 0);
	}
	#[test]
	fn read_with_iter() {
		use std::io::{Read, BufReader};

		let mut buf = Vec::<u8>::new();

		vec![1_u16, 2_u16, 3_u16, 4_u16].write(&mut buf);
		vec![String::from("one"), String::from("two"), String::from("three")].write(&mut buf);

		let bufreader = BufReader::new(buf.as_slice());

		let iter1 = VecReadIter::<u16, _>::start(bufreader);

		assert_eq!(iter1.len(), 4);
		let mut iter1 = iter1.end().unwrap_err();
		assert_eq!(iter1.next().unwrap(), 1_u16);
		assert_eq!(iter1.next().unwrap(), 2_u16);
		assert_eq!(iter1.next().unwrap(), 3_u16);
		assert_eq!(iter1.next().unwrap(), 4_u16);
		assert_eq!(iter1.len(), 0);
		assert!(iter1.next().is_none());
		assert_eq!(iter1.len(), 0);

		let bufreader = iter1.end().unwrap();
		let iter2 = VecReadIter::<String, _>::start(bufreader);

		assert_eq!(iter2.len(), 3);
		let mut iter2 = iter2.end().unwrap_err();
		assert_eq!(iter2.next().unwrap(), String::from("one"));
		assert_eq!(iter2.next().unwrap(), String::from("two"));
		assert_eq!(iter2.next().unwrap(), String::from("three"));
		assert_eq!(iter2.len(), 0);
		assert!(iter2.next().is_none());
		assert_eq!(iter2.len(), 0);

		let mut bufreader = iter2.end().unwrap();

		let mut remaining = Vec::<u8>::new();
		assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
	}
	#[test]
	fn read_write_dates() {
		use std::io::{Read, BufReader};

		let mut buf = Vec::<u8>::new();

		None.write(&mut buf); // TODO: can't specify full type on traits?
		Some(NaiveDate::from_ymd(0, 1, 1)).write(&mut buf);
		Some(NaiveDate::from_ymd(2000, 1, 1)).write(&mut buf);
		Some(NaiveDate::from_ymd(12345, 8, 16)).write(&mut buf);
		Some(chrono::naive::MAX_DATE).write(&mut buf);

		let mut bufreader = BufReader::new(buf.as_slice());

		assert!(Option::<NaiveDate>::read(&mut bufreader).is_none());
		assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(0, 1, 1));
		assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(2000, 1, 1));
		assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(12345, 8, 16));
		assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), chrono::naive::MAX_DATE);

		let mut remaining = Vec::<u8>::new();
		assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
	}
	#[test]
	#[should_panic(expected = "date cannot be serialized")]
	fn write_invalid_date() {
		let mut buf = Vec::<u8>::new();

		Some(NaiveDate::from_ymd(-8, 1, 1)).write(&mut buf);
	}
}
use bin_io::{Serialize, SerializeIter, VecReadIter};

#[repr(u8)]
enum SongMode {
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

struct LibraryEntry {
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
struct LibraryEntryIter<R: BufRead> {
	pub description: String, // empty means none
	pub url: String, // empty means none
	pub authors: Vec<String>,
	pub remix_of: Option<NonMaxU16>, // NonMaxU16 is a good enough usize for a playlist
	pub date: Option<chrono::naive::NaiveDate>,
	pub sample_rate: f64,
	pub mode_and_files: u8, // SongMode and FileCategory
	pub code_original: String, // empty means none // TODO: is this ever used if there are files?
	pub code_minified: String, // empty means none // TODO: is this ever used if there are files?
	children: VecReadIter<LibraryEntry, R>,
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

struct Playlist {
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
	content: VecReadIter<LibraryEntry, R>,
}
impl<R: BufRead> PlaylistIter<R> {
	pub fn read(mut reader: R) -> Self {
		PlaylistIter {
			name: String::read(&mut reader),
			content: VecReadIter::<LibraryEntry, R>::start(reader),
		}
	}
}
