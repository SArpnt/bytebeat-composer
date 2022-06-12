//use lazy_static::lazy_static;
use wasm_bindgen::prelude::*;
use web_sys::{ReadableStream, Element};
//use bin_io::{VecSyncReadIter, VecIterReadIter};
use bin_io::traits::*;
use std::io::BufReader;

mod library_structs;
use library_structs::*;


thread_local! {
	static WINDOW: web_sys::Window = web_sys::window().expect("no global window");
	static DOCUMENT: web_sys::Document = WINDOW.with(|w| w.document().expect("no global document"));
}

#[wasm_bindgen(start)]
pub fn loadLibrary() {
	let buf : [u8; 0] = [];
	let mut reader = BufReader::new(&buf as &[u8]);
	let mut playlist = PlaylistIter::start_read(&mut reader);
	let playlist_id = format!("library-{}", playlist.name);
	let playlist_elem = DOCUMENT.with(|d|
		d.get_element_by_id(playlist_id.as_str())
			.unwrap_or_else(|| panic!("couldn't find playlist elem #{}", playlist_id)
		)
	);
	while let Some(entry) = playlist.content.next(&mut reader) {
		let entry_elem = DOCUMENT.with(|d| d.create_element("li").unwrap());
		loadEntry(entry, &entry_elem, &mut reader);
		playlist_elem.append_with_node_1(&entry_elem);
	}
}

fn loadEntry(mut entry: LibraryEntryIter, entry_elem: &Element, reader: &mut BufReader<&[u8]>) {
	let text = DOCUMENT.with(|d| d.create_text_node("rust test"));
	entry_elem.append_with_node_1(&text);
	
	let children_elem = DOCUMENT.with(|d| d.create_element("ul").unwrap());
	entry_elem.append_with_node_1(&children_elem);
	while let Some(child_entry) = entry.children.next(reader) {
		let child_elem = DOCUMENT.with(|d| d.create_element("li").unwrap());
		loadEntry(child_entry, &child_elem, reader);
		children_elem.append_with_node_1(&child_elem);
	}
}
