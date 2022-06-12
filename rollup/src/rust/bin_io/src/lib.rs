use std::io::{BufRead, Write};
use std::ffi::CString;
use std::mem::MaybeUninit;
use std::marker::PhantomData;
use chrono::naive::NaiveDate;

/**
 * everything panics in every possible fail condition because everything relies on this loading
 * nothing would recover anyways so it's better to not deal with all sorts of useless error types
 */
mod traits {
	use std::io::{BufRead, Write};

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
		fn write(&self, writer: &mut impl Write);
		fn read(reader: &mut impl BufRead) -> Self;
	}
}
use traits::*;


impl<const L: usize> SerializeSync for [u8; L] {
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
		impl SerializeSync for $T {
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
impl SerializeSync for CString {
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
impl SerializeSync for String {
	fn write(&self, writer: &mut impl Write) {
		CString::new(self.clone()).unwrap().write(writer);
	}
	fn read(reader: &mut impl BufRead) -> Self {
		CString::read(reader).into_string().unwrap()
	}
}
impl<T: SerializeSync> SerializeSync for Vec<T> {
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
impl SerializeSync for Option<NaiveDate> {
	// ordinal can be stored in 9 bits
	// negative years aren't needed and chrono uses i32 for years, so the sign bit is free
	// to save space, the extra high bit of the ordinal is stored in the year sign bit
	// ordinal = 0 is invalid, which is used to store None
	// years can be further shortened to i16 (u15) since that's more than enough for this use case
	fn write(&self, writer: &mut impl Write) {
		use chrono::Datelike;

		if let Some(date) = self {
			let year: i32 = date.year();
			if year < 0 || year > i16::MAX.into() {
				panic!("date cannot be serialized");
			}
			let ordinal: u32 = date.ordinal();

			let packed_year: i16 =
				(year as i16) | // year
				(((ordinal & 0x100) << 7) as i16); // ordinal high bit
			let packed_ordinal: u8 = ordinal as u8; // ordinal low byte

			packed_year.write(writer);
			packed_ordinal.write(writer);
		} else {
			0_i16.write(writer);
			0_u8.write(writer);
		}
	}
	fn read(reader: &mut impl BufRead) -> Self {
		let packed_year = i16::read(reader);
		let packed_ordinal = u8::read(reader);

		let year: i32 = (packed_year & 0x7fff) as i32; // year
		let ordinal: u32 =
			(((packed_year >> 7) & 0x100) as u32) | // ordinal high bit
			(packed_ordinal as u32); // ordinal low byte

		NaiveDate::from_yo_opt(year, ordinal)
	}
}


#[derive(Debug)]
pub struct VecSyncReadIter<T: SerializeSync> {
	remaining: u16,
	content: PhantomData<T>,
}
impl<T: SerializeSync> VecSyncReadIter<T> {
	pub fn len_raw(&self) -> u16 { self.remaining }
}
impl<T: SerializeSync> SerializeIterContainer for VecSyncReadIter<T> {
	type Sync = Vec<T>;

	fn start_read(reader: &mut impl BufRead) -> Self {
		let remaining = u16::read(reader);
		VecSyncReadIter {
			remaining,
			content: PhantomData,
		}
	}
	fn collect(mut self, reader: &mut impl BufRead) -> Self::Sync {
		let mut vec = Vec::with_capacity(self.remaining as usize);
		while let Some(i) = self.next(reader) {
			vec.push(i);
		}
		vec
	}
}
impl<T: SerializeSync> SerializeIter for VecSyncReadIter<T> {
	type Item = T;

	fn len(&self) -> usize {
		self.remaining.into()
	}
	fn next(&mut self, reader: &mut impl BufRead) -> Option<Self::Item> {
		if self.remaining > 0 {
			self.remaining -= 1;
			Some(T::read(reader))
		} else {
			None
		}
	}
}

#[derive(Debug)]
pub struct VecIterReadIter<I: SerializeIterContainer> {
	remaining: u16,
	content: PhantomData<I>,
}
impl<I: SerializeIterContainer> VecIterReadIter<I> {
	pub fn len_raw(&self) -> u16 { self.remaining }
}
impl<I: SerializeIterContainer> SerializeIterContainer for VecIterReadIter<I> {
	type Sync = Vec<<I as SerializeIterContainer>::Sync>;

	fn start_read(reader: &mut impl BufRead) -> Self {
		let remaining = u16::read(reader);
		VecIterReadIter {
			remaining,
			content: PhantomData,
		}
	}
	fn collect(mut self, reader: &mut impl BufRead) -> Self::Sync {
		let mut vec = Vec::with_capacity(self.remaining as usize);
		while let Some(i) = self.next(reader) {
			vec.push(i.collect(reader));
		}
		vec
	}
}
impl<I: SerializeIterContainer> SerializeIter for VecIterReadIter<I> {
	type Item = I;

	fn len(&self) -> usize {
		self.remaining.into()
	}
	fn next(&mut self, reader: &mut impl BufRead) -> Option<Self::Item> {
		if self.remaining > 0 {
			self.remaining -= 1;
			Some(I::start_read(reader))
		} else {
			None
		}
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
fn read_write_dates() {
	use std::io::{Read, BufReader};
	use chrono::Datelike;

	let max_date = NaiveDate::from_yo(std::cmp::min(chrono::naive::MAX_DATE.year(), i16::MAX.into()), chrono::naive::MAX_DATE.ordinal());

	let mut buf = Vec::<u8>::new();

	None.write(&mut buf); // TODO: can't specify full type on traits?
	Some(NaiveDate::from_ymd(0, 1, 1)).write(&mut buf);
	Some(NaiveDate::from_ymd(2000, 1, 1)).write(&mut buf);
	Some(NaiveDate::from_ymd(12345, 8, 16)).write(&mut buf);
	Some(max_date).write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	assert!(Option::<NaiveDate>::read(&mut bufreader).is_none());
	assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(0, 1, 1));
	assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(2000, 1, 1));
	assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), NaiveDate::from_ymd(12345, 8, 16));
	assert_eq!(Option::<NaiveDate>::read(&mut bufreader).unwrap(), max_date);

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
#[test]
#[should_panic(expected = "date cannot be serialized")]
fn write_negative_year_date() {
	let mut buf = Vec::<u8>::new();

	Some(NaiveDate::from_yo(-8, 1)).write(&mut buf);
}
#[test]
#[should_panic]
fn write_overflow_year_date() {
	let mut buf = Vec::<u8>::new();

	Some(NaiveDate::from_yo((i16::MAX as i32) + 1, 1)).write(&mut buf);
}
#[test]
fn read_with_sync_iter() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();

	vec![1_u16, 2_u16, 3_u16, 4_u16].write(&mut buf);
	vec![String::from("one"), String::from("two"), String::from("three")].write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	let mut iter1 = VecSyncReadIter::<u16>::start_read(&mut bufreader);

	assert_eq!(iter1.len(), 4_usize);
	assert_eq!(iter1.len_raw(), 4_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 1_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 2_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 3_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 4_u16);
	assert_eq!(iter1.len(), 0);
	assert!(iter1.next(&mut bufreader).is_none());
	assert_eq!(iter1.len(), 0);
	assert_eq!(iter1.collect(&mut bufreader).len(), 0);

	let mut iter2 = VecSyncReadIter::<String>::start_read(&mut bufreader);

	assert_eq!(iter2.len(), 3_usize);
	assert_eq!(iter2.len_raw(), 3_u16);
	assert_eq!(iter2.next(&mut bufreader).unwrap(), String::from("one"));
	let vec2 = iter2.collect(&mut bufreader);
	assert_eq!(vec2.len(), 2);
	assert_eq!(vec2[0], String::from("two"));
	assert_eq!(vec2[1], String::from("three"));

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
#[test]
fn read_with_iter_iter() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();

	let data = vec![
		vec![11_u8, 12_u8, 13_u8, 14_u8],
		vec![21_u8],
		vec![31_u8, 32_u8, 33_u8, 34_u8],
		vec![],
	];
	data.write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	let mut iter = VecIterReadIter::<VecSyncReadIter<u8>>::start_read(&mut bufreader);

	assert_eq!(iter.len(), data.len());
	assert_eq!(iter.len_raw(), data.len() as u16);
	let mut x = 0;
	while let Some(mut i) = iter.next(&mut bufreader) {
		let mut y = 0;
		assert_eq!(i.len(), data[x].len());
		assert_eq!(i.len_raw(), data[x].len() as u16);
		while let Some(n) = i.next(&mut bufreader) {
			println!("n = {}, data[{}][{}] = {}", n, x, y, data[x][y]);
			assert_eq!(n, data[x][y]);
			y += 1;
		}
		assert!(i.next(&mut bufreader).is_none());
		assert_eq!(i.len(), 0);
		x += 1;
	}
	assert!(iter.next(&mut bufreader).is_none());
	assert_eq!(iter.len(), 0);

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
