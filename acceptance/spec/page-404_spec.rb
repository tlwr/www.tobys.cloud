require 'spec_helper'
require 'securerandom'

describe 'page-404', type: :feature do
  def random_subdomain(domain)
    rsub = SecureRandom.hex 4
    "https://#{rsub}.#{domain}/"
  end

  %w( toby.codes tobys.cloud ).each do |domain|
    describe domain do
      it 'matches a random subdomain' do
        begin
          page = agent.get(random_subdomain(domain))
        rescue Mechanize::ResponseCodeError => e
          page = e.page
          raise e unless page.code.to_i == 404
        end

        expect(page.link.text).to eq('www.toby.codes')
      end
    end
  end
end
