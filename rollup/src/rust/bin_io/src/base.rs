use std::io::BufRead;
use std::ffi::CString;
use std::mem::MaybeUninit;
use std::marker::PhantomData;
use crate::traits::*;
#[cfg(feature = "write")]
use std::io::Write;
#[cfg(feature = "write")]
use std::ffi::CStr;

#[cfg(feature = "write")]
impl<const L: usize> SerializeWrite for [u8; L] {
	fn write(&self, writer: &mut impl Write) {
		writer.write_all(self).unwrap();
	}
}
impl<const L: usize> SerializeSync for [u8; L] {
	fn read(reader: &mut impl BufRead) -> Self {
		// safe because all possible bits are valid
		let mut buffer: [u8; L] = unsafe { MaybeUninit::uninit().assume_init() }; // TODO: is there a better way to write this?
		reader.read_exact(&mut buffer).unwrap();
		buffer
	}
}
macro_rules! integer_serial {
	($T:ident) => {
		#[cfg(feature = "write")]
		impl SerializeWrite for $T {
			fn write(&self, writer: &mut impl Write) {
				self.to_le_bytes().write(writer);
			}
		}
		impl SerializeSync for $T {
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
#[cfg(feature = "write")]
impl SerializeWrite for CStr {
	fn write(&self, writer: &mut impl Write) {
		writer.write_all(self.to_bytes_with_nul()).unwrap();
	}
}
impl SerializeSync for CString {
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
#[cfg(feature = "write")]
impl SerializeWrite for String {
	fn write(&self, writer: &mut impl Write) {
		CString::new(self.clone()).unwrap().as_c_str().write(writer);
	}
}
impl SerializeSync for String {
	fn read(reader: &mut impl BufRead) -> Self {
		//unsafe {String::from_utf8_unchecked(CString::read(reader).into_bytes())}
		// TODO: 0.6K is saved by removing the utf8 check, offload this to the browser if possible
		String::from_utf8(CString::read(reader).into_bytes()).unwrap()
	}
}
#[cfg(feature = "write")]
impl<T: SerializeWrite> SerializeWrite for Vec<T> {
	fn write(&self, writer: &mut impl Write) {
		u16::try_from(self.len()).unwrap().write(writer);
		for x in self.iter() {
			x.write(writer);
		}
	}
}
impl<T: SerializeSync> SerializeSync for Vec<T> {
	fn read(reader: &mut impl BufRead) -> Self {
		let len = u16::read(reader);
		let mut vec = Vec::with_capacity(len.into());
		for _ in 0..len {
			vec.push(T::read(reader));
		}
		vec
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
